import { makeRestApiRequest, streamRequest } from '@n8n/rest-api-client';
import type { IRestApiContext } from '@n8n/rest-api-client';
import type { StructuredChunk } from './chat.types';
import type { INodeCredentials } from 'n8n-workflow';

export const fetchChatModelsApi = async (context: IRestApiContext, provider: 'openai') => {
	const apiEndpoint = `/chat/agents/models/${provider}`;
	return await makeRestApiRequest<string[]>(context, 'GET', apiEndpoint);
};

export const sendText = (
	ctx: IRestApiContext,
	payload: {
		message: string;
		provider: string;
		model: string;
		messageId: string;
		sessionId: string;
		credentials: INodeCredentials;
	},
	onMessageUpdated: (data: StructuredChunk) => void,
	onDone: () => void,
	onError: (e: Error) => void,
): void => {
	void streamRequest<StructuredChunk>(
		ctx,
		'/chat/agents/n8n',
		payload,
		onMessageUpdated,
		onDone,
		onError,
		'\n',
	);
};
