import { Logger } from '@n8n/backend-common';
import { OpenAiChatAgent } from '@n8n/chat-hub';
import { ChatConfig } from '@n8n/config';
import {
	ExecutionRepository,
	IExecutionResponse,
	ProjectRepository,
	SharedWorkflow,
	SharedWorkflowRepository,
	User,
	WorkflowEntity,
	WorkflowRepository,
} from '@n8n/db';
import { Service } from '@n8n/di';
import type { Response } from 'express';
import {
	IConnections,
	INode,
	OperationalError,
	type ITaskData,
	type IWorkflowBase,
	type StartNodeData,
} from 'n8n-workflow';
import { v4 as uuidv4 } from 'uuid';

import { ChatPayloadWithCredentials, type ChatPayload } from './chat-hub.types';

import { NotFoundError } from '@/errors/response-errors/not-found.error';
import { WorkflowExecutionService } from '@/workflows/workflow-execution.service';
@Service()
export class ChatHubService {
	private agent: OpenAiChatAgent;

	constructor(
		private readonly logger: Logger,
		private readonly chatConfig: ChatConfig,
		private readonly executionRepository: ExecutionRepository,
		private readonly workflowExecutionService: WorkflowExecutionService,
		private readonly workflowRepository: WorkflowRepository,
		private readonly projectRepository: ProjectRepository,
		private readonly sharedWorkflowRepository: SharedWorkflowRepository,
	) {
		this.agent = new OpenAiChatAgent({
			logger: this.logger,
			apiKey: this.chatConfig.openAiApiKey,
		});
	}

	async getModels() {
		return await Promise.resolve(['gpt-3.5-turbo', 'gpt-4']);
	}

	async *ask(payload: ChatPayload, abortSignal?: AbortSignal) {
		yield* this.agent.ask(payload, abortSignal);
	}

	private async createChatWorkflow(
		user: User,
		sessionId: string,
		nodes: INode[],
		connections: IConnections,
	) {
		const { manager } = this.projectRepository;
		const existing = await this.workflowRepository.findOneBy({ id: sessionId });
		if (existing) {
			return existing;
		}

		return await manager.transaction(async (trx) => {
			const project = await this.projectRepository.getPersonalProjectForUser(user.id, trx);
			if (!project) {
				throw new NotFoundError('Could not find a personal project for this user');
			}

			const newWorkflow = new WorkflowEntity();
			newWorkflow.versionId = uuidv4();
			newWorkflow.id = sessionId;
			newWorkflow.name = `Chat ${sessionId}`;
			newWorkflow.active = false;
			newWorkflow.nodes = nodes;
			newWorkflow.connections = connections;

			const workflow = await trx.save<WorkflowEntity>(newWorkflow);

			await trx.save<SharedWorkflow>(
				this.sharedWorkflowRepository.create({
					role: 'workflow:owner',
					projectId: project.id,
					workflow,
				}),
			);

			return workflow;
		});
	}

	private getMessage(execution: IExecutionResponse): string | undefined {
		const lastNodeExecuted = execution.data.resultData.lastNodeExecuted;
		if (typeof lastNodeExecuted !== 'string') return undefined;

		const runIndex = execution.data.resultData.runData[lastNodeExecuted].length - 1;
		const mainOutputs = execution.data.resultData.runData[lastNodeExecuted][runIndex]?.data?.main;

		// Check all main output branches for a message
		if (mainOutputs && Array.isArray(mainOutputs)) {
			for (const branch of mainOutputs) {
				if (branch && Array.isArray(branch) && branch.length > 0 && branch[0].json?.output) {
					return branch[0].json.output as string;
				}
			}
		}

		return undefined;
	}

	async askN8n(res: Response, user: User, payload: ChatPayloadWithCredentials) {
		/* eslint-disable @typescript-eslint/naming-convention */
		const nodes: INode[] = [
			{
				parameters: {
					public: true,
					mode: 'webhook',
					options: { responseMode: 'streaming' },
				},
				type: '@n8n/n8n-nodes-langchain.chatTrigger',
				typeVersion: 1.3,
				position: [0, 0],
				id: uuidv4(),
				name: 'When chat message received',
				webhookId: uuidv4(),
			},
			{
				parameters: {
					options: {
						enableStreaming: true,
					},
				},
				type: '@n8n/n8n-nodes-langchain.agent',
				typeVersion: 3,
				position: [200, 0],
				id: uuidv4(),
				name: 'AI Agent',
			},
			{
				parameters: {
					model: { __rl: true, mode: 'list', value: payload.model },
					options: {},
				},
				type: payload.provider,
				typeVersion: 1.2,
				position: [80, 200],
				id: uuidv4(),
				name: 'Chat Model',
				credentials: payload.credentials,
			},
		];

		const connections: IConnections = {
			'When chat message received': {
				main: [[{ node: 'AI Agent', type: 'main', index: 0 }]],
			},
			'Chat Model': {
				ai_languageModel: [[{ node: 'AI Agent', type: 'ai_languageModel', index: 0 }]],
			},
		};

		const workflow = await this.createChatWorkflow(user, payload.sessionId, nodes, connections);
		const workflowData: IWorkflowBase = {
			...workflow,
			nodes,
			connections,
			versionId: uuidv4(),
		};
		/* eslint-enable @typescript-eslint/naming-convention */

		const startNodes: StartNodeData[] = [{ name: 'AI Agent', sourceData: null }];
		const triggerToStartFrom: {
			name: string;
			data?: ITaskData;
		} = {
			name: 'When chat message received',
			data: {
				startTime: Date.now(),
				executionTime: 0,
				executionIndex: 0,
				executionStatus: 'success',
				data: {
					main: [
						[
							{
								json: {
									sessionId: payload.sessionId,
									action: 'sendMessage',
									chatInput: payload.message,
								},
							},
						],
					],
				},
				source: [null],
			},
		};

		this.logger.debug(`Starting execution of workflow "${workflow.name}" with ID ${workflow.id}`);

		const { executionId } = await this.workflowExecutionService.executeManually(
			{
				workflowData,
				startNodes,
				triggerToStartFrom,
			},
			user,
			undefined,
			true,
			res,
		);

		if (!executionId) {
			throw new OperationalError('There was a problem starting the chat execution.');
		}

		// TODO: The execution finishes after a while, how do we store the full AI response on the database?
		// Is there a better way to listen for the execution to finish?
		const onClose = async () => {
			this.logger.debug(`Connection closed by client, execution ID: ${executionId}`);

			// TODO: we could maybe stop executions here if user disconnected early?
			// if (execution && ['running', 'waiting'].includes(execution.status)) {
			// 	await this.executionService.stop(executionId, [workflow.id]);
			// }

			const execution = await this.executionRepository.findWithUnflattenedData(executionId, [
				workflow.id,
			]);

			// Persist the assistant message to the database
			if (execution?.data?.resultData) {
				// resultData is only available if the execution finished
				const message = this.getMessage(execution);
				this.logger.debug(`Assistant: ${message} (${payload.replyId})`);
			}
		};

		res.on('close', onClose);
		res.on('error', onClose);
	}
}
