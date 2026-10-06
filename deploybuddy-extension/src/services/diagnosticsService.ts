import * as vscode from 'vscode';
import type { DiagnosticSignals } from '../types/deployment';
export function getDiagnosticSignals(): DiagnosticSignals {
  try {
    let errors = 0; let warnings = 0;
    for (const [uri, diagnostics] of vscode.languages.getDiagnostics()) {
      const folder = vscode.workspace.getWorkspaceFolder(uri);
      if (!folder || uri.scheme !== folder.uri.scheme) continue;
      const relativePath = uri.path.slice(folder.uri.path.length).split('/');
      if (relativePath.some(part => ['node_modules', '.git', 'vendor', 'dist', 'build', 'out', 'coverage', '.next', '.venv', 'venv'].includes(part))) continue;
      for (const diagnostic of diagnostics) {
        if (diagnostic.severity === vscode.DiagnosticSeverity.Error) errors++;
        if (diagnostic.severity === vscode.DiagnosticSeverity.Warning) warnings++;
      }
    }
    return { available: true, errors, warnings, note: 'Current published diagnostics in workspace folders only; dependency, generated, and virtual files are excluded. An empty snapshot is not proof of a clean build.' };
  } catch { return { available: false, errors: 0, warnings: 0, note: 'Workspace diagnostics could not be read.' }; }
}
