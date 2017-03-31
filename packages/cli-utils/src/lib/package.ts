import * as http from 'http';

import { IClient, PackageBuild } from '../definitions';
import { isPackageBuildResponse, isPackageBuildsResponse } from '../guards';
import { createFatalAPIFormat } from './http';
import { load } from './modules';

export class PackageClient {
  constructor(protected appUserToken: string, protected client: IClient) {}

  formatFilename(build: PackageBuild) {
    const extension = build.platform === 'android' ? 'apk' : 'ipa';
    return `${build.name}.${extension}`;
  }

  async getBuild(id: number, { fields = [] }: { fields?: string[] }): Promise<PackageBuild> {
    if (fields.indexOf('url') === -1) {
      fields.push('url');
    }

    const req = this.client.make('GET', `/package/builds/${id}`)
      .set('Authorization', `Bearer ${this.appUserToken}`)
      .query({ fields })
      .send();

    const res = await this.client.do(req);

    if (!isPackageBuildResponse(res)) {
      throw createFatalAPIFormat(req, res);
    }

    return res.data;
  }

  async getBuilds({ page = 1, pageSize = 25 }: { page?: number, pageSize?: number }): Promise<PackageBuild[]> {
    const req = this.client.make('GET', '/package/builds')
      .set('Authorization', `Bearer ${this.appUserToken}`)
      .query({ page, 'page_size': pageSize, })
      .send();

    const res = await this.client.do(req);

    if (!isPackageBuildsResponse(res)) {
      throw createFatalAPIFormat(req, res);
    }

    return res.data;
  }

  downloadBuild(build: PackageBuild, dest: NodeJS.WritableStream, { progress }: { progress?: (loaded: number, total: number) => void }): Promise<void> {
    return new Promise<void>((resolve, reject) => {
      if (build.status !== 'SUCCESS') {
        return reject(new Error(`Build must be 'SUCCESS', not '${build.status}'.`));
      }

      if (!build.url) {
        return reject(new Error('Build must have URL.'));
      }

      const superagent = load('superagent');

      dest.on('error', (err: any) => {
        reject(err);
      });

      dest.on('close', () => {
        resolve();
      });

      superagent.get(build.url)
        .on('response', (res: http.IncomingMessage) => {
          if (progress) {
            let loaded = 0;
            const total = Number(res.headers['content-length']);
            res.on('data', (chunk) => {
              loaded += chunk.length;
              progress(loaded, total);
            });
          }
        })
        .on('error', (err) => {
          reject(err);
        })
        .pipe(dest);
    });
  }

}