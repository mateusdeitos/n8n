import type {
	IDataObject,
	ILoadOptionsFunctions,
	INodeListSearchItems,
	INodeListSearchResult,
} from 'n8n-workflow';
import type { Model } from 'openai/resources/models';

import { apiRequest } from '../../transport';

export async function fileSearch(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const { data } = await apiRequest.call(this, 'GET', '/files');

	if (filter) {
		const results: INodeListSearchItems[] = [];

		for (const file of data || []) {
			if ((file.filename as string)?.toLowerCase().includes(filter.toLowerCase())) {
				results.push({
					name: file.filename as string,
					value: file.id as string,
				});
			}
		}

		return {
			results,
		};
	} else {
		return {
			results: (data || []).map((file: IDataObject) => ({
				name: file.filename as string,
				value: file.id as string,
			})),
		};
	}
}

const getModelSearch =
	(filterCondition: (model: Model) => boolean) =>
	async (ctx: ILoadOptionsFunctions, filter?: string): Promise<INodeListSearchResult> => {
		let { data } = (await apiRequest.call(ctx, 'GET', '/models')) as { data: Model[] };

		data = data?.filter((model) => filterCondition(model));

		let results: INodeListSearchItems[] = [];

		if (filter) {
			for (const model of data || []) {
				if (model.id?.toLowerCase().includes(filter.toLowerCase())) {
					results.push({
						name: model.id.toUpperCase(),
						value: model.id,
					});
				}
			}
		} else {
			results = (data || []).map((model) => ({
				name: model.id.toUpperCase(),
				value: model.id,
			}));
		}

		results = results.sort((a, b) => a.name.localeCompare(b.name));
		return {
			results,
		};
	};

export async function modelSearch(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	const credentials = await this.getCredentials<{ url: string }>('openAiApi');
	const url = credentials.url && new URL(credentials.url);
	const isCustomAPI = url && !['api.openai.com', 'ai-assistant.n8n.io'].includes(url.hostname);
	return await getModelSearch(
		(model) =>
			!isCustomAPI &&
			!(
				model.id.startsWith('babbage') ||
				model.id.startsWith('davinci') ||
				model.id.startsWith('computer-use') ||
				model.id.startsWith('dall-e') ||
				model.id.startsWith('text-embedding') ||
				model.id.startsWith('tts') ||
				model.id.startsWith('whisper') ||
				model.id.startsWith('omni-moderation') ||
				(model.id.startsWith('gpt-') && model.id.includes('instruct'))
			),
	)(this, filter);
}

export async function imageModelSearch(
	this: ILoadOptionsFunctions,
	filter?: string,
): Promise<INodeListSearchResult> {
	return await getModelSearch(
		(model) => model.id.includes('vision') || model.id.includes('gpt-4o'),
	)(this, filter);
}
