import { cpSync, existsSync, lstatSync, mkdirSync, readdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { dirname, extname, isAbsolute, join, relative, resolve, sep } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const root=realpathSync(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
const pkg=JSON.parse(readFileSync(join(root,'package.json'),'utf8').replace(/^\uFEFF/,''));
const version=pkg.version;
if(!/^\d+\.\d+\.\d+$/.test(version))throw new Error('A semantic release version is required.');
const out=resolve(root,'release',`v${version}`);mkdirSync(out,{recursive:true});
if(!realpathSync(out).startsWith(root+sep))throw new Error('Release directory must remain inside the project.');
const source=join(out,'source'),deployment=join(out,'deployment');
function cleanGenerated(path){
 if(!existsSync(path))return;
 const resolved=realpathSync(path),rel=relative(out,resolved);
 if(isAbsolute(rel)||!['source','deployment'].includes(rel)||lstatSync(path).isSymbolicLink())throw new Error('Refusing to replace an unexpected path.');
 if(!process.argv.includes('--replace')||!existsSync(join(path,'.release-generated'))||readFileSync(join(path,'.release-generated'),'utf8')!==version)throw new Error('Generated release already exists. Use --replace only for this generated output.');
 if(existsSync(join(path,'.git')))throw new Error('Refusing to replace a Git checkout.');
 rmSync(resolved,{recursive:true,force:true});
}
for(const path of [source,deployment]){cleanGenerated(path);mkdirSync(path,{recursive:true});writeFileSync(join(path,'.release-generated'),version);}
function safeCopy(from,to){
 const info=lstatSync(from);if(info.isSymbolicLink())throw new Error(`Symlink not allowed in release: ${relative(root,from)}`);
 if(info.isDirectory()){mkdirSync(to,{recursive:true});for(const name of readdirSync(from))safeCopy(join(from,name),join(to,name));}
 else{mkdirSync(dirname(to),{recursive:true});writeFileSync(to,readFileSync(from));}
}
const dependencyLicenses=join(root,'docs','dependency-licenses');mkdirSync(dependencyLicenses,{recursive:true});
for(const name of ['react','react-dom','lucide-react','vite','esbuild','playwright']){
 const directory=join(root,'node_modules',name);
 if(!existsSync(directory))throw new Error(`Install dependencies first: missing ${name}`);
 const license=readdirSync(directory).find(name=>/^license(?:\.|$)/i.test(name));
 if(!license)throw new Error(`Missing license for ${name}`);
 safeCopy(join(directory,license),join(dependencyLicenses,`${name}.txt`));
}
const rootFiles=['package.json','package-lock.json','index.html','vite.config.js','.gitignore','.gitattributes','.env.example','README.md','CHANGELOG.md','LICENSE','THIRD_PARTY_NOTICES.md'];
for(const file of rootFiles)safeCopy(join(root,file),join(source,file));
for(const dir of ['src','server','shared','public','tests','docs'])safeCopy(join(root,dir),join(source,dir));
for(const file of ['build.mjs','package-release.mjs','check-editor-workspace.mjs'])safeCopy(join(root,'scripts',file),join(source,'scripts',file));
const deploymentFiles=['README.md','compose.example.yaml','production.env.example','nginx.example.conf','sso-bridge.inc'];
for(const file of deploymentFiles){safeCopy(join(root,'deploy',file),join(source,'deploy',file));safeCopy(join(root,'deploy',file),join(deployment,'deploy',file));}
for(const dir of ['dist','dist-server']){
 if(!existsSync(join(root,dir)))throw new Error('Run npm run build:published before packaging.');
 safeCopy(join(root,dir),join(deployment,dir));
}
for(const file of ['README.md','CHANGELOG.md','LICENSE','THIRD_PARTY_NOTICES.md','.env.example'])safeCopy(join(root,file),join(deployment,file));
safeCopy(join(root,'docs'),join(deployment,'docs'));
safeCopy(join(root,'public','demo'),join(deployment,'public','demo'));

function walk(directory){return readdirSync(directory,{withFileTypes:true}).flatMap(item=>item.isDirectory()?walk(join(directory,item.name)):[join(directory,item.name)]);}
const patterns=[['private-key',/-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/],['github-token',/(?:gh[pousr]_[A-Za-z0-9]{30,}|github_pat_[A-Za-z0-9_]{40,})/],['api-key',/\bsk-[A-Za-z0-9]{32,}\b/],['literal-bearer',/Bearer [A-Za-z0-9_\-]{40,}/]];
const issues=[];
for(const file of walk(source)){
 const rel=relative(source,file).replaceAll('\\','/');
 if(/(?:^|\/)(?:node_modules|data|\.git)(?:\/|$)|\.(?:sqlite|db|log|pem|key)$|(?:^|\/)\.env$|(?:^|\/)(?:auth|credentials)\.json$/i.test(rel))issues.push({file:rel,type:'forbidden-file'});
 if(['.js','.jsx','.mjs','.json','.md','.yaml','.conf','.inc','.example','.txt'].includes(extname(file))||['LICENSE','.env.example'].includes(rel)){
  const text=readFileSync(file,'utf8');for(const [name,pattern] of patterns)if(pattern.test(text))issues.push({file:rel,type:name});
 }
}
if(issues.length){writeFileSync(join(out,'source-audit.json'),JSON.stringify({pass:false,issues},null,2));throw new Error('Source audit needs review. Paths/types are in source-audit.json; no matched secrets were logged.');}
const hash=file=>createHash('sha256').update(readFileSync(file)).digest('hex');
const manifest={version,builtAt:new Date().toISOString(),sourceFiles:walk(source).length,deploymentFiles:walk(deployment).map(file=>({path:relative(deployment,file).replaceAll('\\','/'),sha256:hash(file)})),sourceAudit:{pass:true,issues:[]}};
writeFileSync(join(out,'RELEASE_MANIFEST.json'),JSON.stringify(manifest,null,2));
for(const [folder,name] of [[source,'source'],[deployment,'deployment']]){
 const archive=join(out,`yingjian-${version}-${name}.tar.gz`);
 const result=spawnSync('tar',['-czf',archive,'-C',folder,'.'],{stdio:'inherit'});
 if(result.status!==0)throw new Error(`Archive failed: ${name}`);
}
const archives=[`yingjian-${version}-source.tar.gz`,`yingjian-${version}-deployment.tar.gz`,'RELEASE_MANIFEST.json'];
writeFileSync(join(out,'SHA256SUMS'),archives.map(file=>`${hash(join(out,file))}  ${file}`).join('\n')+'\n');
console.log(JSON.stringify({version,output:out,sourceFiles:manifest.sourceFiles,sourceAudit:'passed',archives},null,2));
