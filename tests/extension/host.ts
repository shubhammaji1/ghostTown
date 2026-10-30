import * as vscode from 'vscode';
import assert from 'node:assert/strict';
export async function run(): Promise<void> {
  const extension = vscode.extensions.getExtension('shubhammaji1.ghosttown');
  assert(extension, 'Extension installed/discovered');
  await extension.activate();
  assert(extension.isActive);
  const commands = await vscode.commands.getCommands(true);
  for (const id of [
    'ghosttown.runPopulation',
    'ghosttown.stopRun',
    'ghosttown.configureTarget',
    'ghosttown.openRunHistory',
    'ghosttown.installBrowser',
  ])
    assert(commands.includes(id), id);
  await vscode.commands.executeCommand('workbench.view.extension.ghosttown');
  await vscode.commands.executeCommand('ghosttown.stopRun');
  console.log(
    'PASS: real extension-host activation, registered commands, sidebar container and idle cancellation',
  );
}
