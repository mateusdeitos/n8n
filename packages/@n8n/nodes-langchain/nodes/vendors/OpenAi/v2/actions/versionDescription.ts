/* eslint-disable n8n-nodes-base/node-filename-against-convention */
import type { INodeTypeDescription } from 'n8n-workflow';
import { NodeConnectionTypes } from 'n8n-workflow';

import * as audio from './audio';
import * as file from './file';
import * as image from './image';
import * as text from './text';

const configureNodeInputs = (resource: string, operation: string, hideTools: string) => {
	if (resource === 'text' && operation === 'message') {
		if (hideTools === 'hide') {
			return ['main'];
		}
		return [{ type: 'main' }, { type: 'ai_tool', displayName: 'Tools' }];
	}

	return ['main'];
};

export const versionDescription: INodeTypeDescription = {
	displayName: 'OpenAI',
	name: 'openAi',
	group: ['transform'],
	description: 'Message an GPT, analyze images, generate audio, etc.',
	version: [2],
	defaults: {
		name: 'OpenAI',
	},
	inputs: `={{(${configureNodeInputs})($parameter.resource, $parameter.operation, $parameter.hideTools)}}`,
	outputs: [NodeConnectionTypes.Main],
	credentials: [
		{
			name: 'openAiApi',
			required: true,
		},
	],
	properties: [
		{
			displayName: 'Resource',
			name: 'resource',
			type: 'options',
			noDataExpression: true,
			// eslint-disable-next-line n8n-nodes-base/node-param-options-type-unsorted-items
			options: [
				{
					name: 'Text',
					value: 'text',
				},
				{
					name: 'Image',
					value: 'image',
				},
				{
					name: 'Audio',
					value: 'audio',
				},
				{
					name: 'File',
					value: 'file',
				},
			],
			default: 'text',
		},
		...audio.description,
		...file.description,
		...image.description,
		...text.description,
	],
};
