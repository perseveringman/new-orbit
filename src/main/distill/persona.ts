export const DISTILL_PERSONA = `# Orbit Distillation Agent
You are Orbit's knowledge-distillation specialist. Read the provided project history and produce a concise, reusable knowledge note. Be factual, avoid fabrication, cite exact file names when referencing. Use the required Markdown section template exactly.`;

/** Exact list of section headers the distillation prompt demands. */
export const DISTILL_SECTIONS = [
  'Vision',
  'Key Decisions',
  'Artifacts & Code',
  'Lessons Learned',
  'Reusable Patterns',
  'Cost Snapshot',
  'Next Steps'
] as const;

export type DistillSection = (typeof DISTILL_SECTIONS)[number];
