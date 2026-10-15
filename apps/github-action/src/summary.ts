import * as core from '@actions/core';
import { renderAssessmentMarkdown, type AssessmentSections } from './presentation/report';

export async function writeSummary(report: AssessmentSections): Promise<void> {
  await core.summary.addRaw(renderAssessmentMarkdown(report), true).write();
}
