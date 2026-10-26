import {readFile,writeFile} from 'node:fs/promises';
import {resolve} from 'node:path';
import {pathToFileURL} from 'node:url';
import {produceSeedArtifact,packagingConfig} from './delivery/base/package.mjs';
import {loadSetupManifest} from './delivery/base/setup-manifest.mjs';

/** Purse-owned additions compose with the retained Base packaging policy. */
export async function pursePackaging() {
    const config=JSON.parse(await readFile('packaging.json','utf8'));
    config.artifact.specInputs.optionalSecretNames.push('SAML_PROVIDERS');
    config.project.operations.artifact='node scripts/purse-delivery.mjs artifact';
    return config;
}
if(process.argv[1] && import.meta.url===pathToFileURL(resolve(process.argv[1])).href) {
    const config=await pursePackaging(),root=process.cwd();
    if(process.argv[2]==='artifact') console.log(JSON.stringify(await produceSeedArtifact({root,config})));
    else if(process.argv[2]==='project') {
        const {project,setup}=packagingConfig(config),selected=await loadSetupManifest(root,setup,config.artifact.specInputs.mail);
        await writeFile('rer-project.json',JSON.stringify({...project,setup:{path:selected.path,sha256:selected.sha256}},null,2)+'\n');
    } else throw Error('Choose artifact or project');
}
