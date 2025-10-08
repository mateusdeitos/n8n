import type { IDataObject, ILoadOptionsFunctions, INodePropertyOptions } from 'n8n-workflow';

import { apiRequest } from '../../transport';

export async function getFiles(this: ILoadOptionsFunctions): Promise<INodePropertyOptions[]> {
	// TODO: get purpose from options?
	const options = this.getNodeParameter('options', {}) as IDataObject;
	const { data } = await apiRequest.call(this, 'GET', '/files', {
		qs: { purpose: options?.purpose || 'user_data' },
	});

	const returnData: INodePropertyOptions[] = [];

	for (const file of data || []) {
		returnData.push({
			name: file.filename as string,
			value: file.id as string,
		});
	}

	return returnData;
}
