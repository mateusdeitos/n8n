import { makeRestApiRequest, streamRequest } from '@n8n/rest-api-client';
import type { IRestApiContext } from '@n8n/rest-api-client';
import type { StreamOutput } from './chat.types';
import type { INodeCredentials } from 'n8n-workflow';

export const fetchChatModelsApi = async (context: IRestApiContext, provider: 'openai') => {
	const apiEndpoint = `/chat/agents/models/${provider}`;
	return await makeRestApiRequest<string[]>(context, 'GET', apiEndpoint);
};

export const messageChatApi = (
	ctx: IRestApiContext,
	provider: 'openai',
	payload: {
		provider: string;
		model: string;
		messageId: string;
		sessionId: string;
		message: string;
		credentials: INodeCredentials;
	},
	onMessageUpdated: (data: StreamOutput) => void,
	onDone: () => void,
	onError: (e: Error) => void,
): void => {
	void streamRequest<StreamOutput>(
		ctx,
		'/chat/agents/n8n',
		payload,
		onMessageUpdated,
		onDone,
		onError,
	);
};
