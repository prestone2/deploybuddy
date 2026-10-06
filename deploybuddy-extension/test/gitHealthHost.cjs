const vscode=require('vscode');const assert=require('node:assert/strict');const fs=require('node:fs');
const {getGitSignals}=require('../out/services/gitService');const {analyzeGitGuardrails}=require('../out/core/analyzeGitGuardrails');
exports.run=async()=>{
 const extension=vscode.extensions.getExtension('deploybuddy.deploybuddy');assert.ok(extension);await extension.activate();await vscode.workspace.getConfiguration('deploybuddy').update('aiEnabled',false,vscode.ConfigurationTarget.Global);
 let git=await getGitSignals();for(let i=0;(git.repositories.length<3||git.repositories.some(r=>r.ahead===null||r.behind===null))&&i<30;i++){await new Promise(r=>setTimeout(r,500));git=await getGitSignals()}assert.equal(git.repositories.length,3);
 const find=name=>{const repo=git.repositories.find(r=>r.root.endsWith('/'+name));assert.ok(repo);return repo};
 const clean=find('health-clean');assert.equal(clean.hasUncommittedChanges,false);assert.equal(clean.ahead,0);assert.equal(clean.behind,0);assert.equal(clean.detachedHead,false);
 const dirty=find('health-dirty');assert.equal(dirty.hasUncommittedChanges,true);assert.equal(dirty.stagedFiles,1);assert.equal(dirty.unstagedFiles,1);assert.equal(dirty.untrackedFiles,1);assert.equal(dirty.conflictFiles,0);
 const diverged=find('health-diverged');assert.equal(diverged.ahead,1);assert.equal(diverged.behind,1);assert.equal(diverged.upstream,'origin/main');assert.ok(analyzeGitGuardrails(git,'push').some(f=>f.code==='diverged'));
 const health=await vscode.commands.executeCommand('deploybuddy.gitHealth');assert.ok(health.result);
 const check=vscode.commands.executeCommand('deploybuddy.prePushCheck');await new Promise(r=>setTimeout(r,500));await vscode.commands.executeCommand('notifications.clearAll');const prePush=await check;assert.equal(prePush.result.score,health.result.score);
 const after=await getGitSignals();assert.deepEqual(after.repositories,git.repositories);
 fs.writeFileSync('/tmp/deploybuddy-host/git-health-result.json',JSON.stringify({passed:true,clean,dirty,diverged,score:health.result.score,repositoryStateUnchanged:true},null,2));console.log('DEPLOYBUDDY GIT HEALTH HOST PASS');
};
