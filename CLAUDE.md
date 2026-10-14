# LineagePlanner-Salty — Project Instructions

## 1. Project goals

This repository contains LineagePlanner-Salty, an application for analyzing Uma Musume parent and grandparent lineages.

The intended use cases include:
- Finding suitable parent and grandparent combinations for a target Uma Musume.
- Evaluating compatibility and affinity between characters.
- Comparing inherited skills and other lineage properties.
- Considering running style, track surface, distance, and track-specific requirements where supported by the data.
- Making lineage planning understandable and useful to players.

Treat these as product goals, not proof that every feature already exists.

Before changing functionality, inspect the current implementation and determine what is already supported.

## 2. Start with repository discovery

At the beginning of a substantial task:

1. Read this file and any relevant nested `CLAUDE.md` files.
2. Inspect the repository structure and Git status.
3. Identify the language, framework, package manager, application entry points, and test tooling.
4. Locate the relevant implementation and existing tests before proposing changes.
5. Check the current implementation before relying on assumptions from earlier conversations.

Use targeted searches rather than reading the entire repository by default.

Do not spend time rediscovering the project structure for every small follow-up task when the relevant information is already available in the current session.

## 3. Subagent delegation

Use specialized subagents to keep investigations isolated from the main session.

### Code investigation

Delegate small, read-only questions to `code-investigator`, using Sonnet with medium effort.

Examples:
- Locate a function or configuration setting.
- Trace a specific data flow.
- Find where affinity or inheritance calculations are implemented.
- Identify the API endpoint responsible for a feature.
- Summarize the relevant files before a larger change.

Request concise findings with file paths, line numbers, and uncertainties.

### Bug investigation

Delegate focused root-cause investigations to `bug-investigator`, using Sonnet with medium effort.

Examples:
- Trace a specific exception or incorrect result.
- Investigate a failing test.
- Determine whether a bug originates in the frontend, backend, or data layer.

The investigator must report evidence and a proposed fix without modifying files.

### Test writing

Use `test-writer`, using Sonnet with medium effort, for isolated test-writing tasks with clearly defined expected behavior.

The agent may edit test files and run relevant tests when safe.

The agent may also delete tests if it deems them not relevant anymore

Do not give multiple agents overlapping write responsibilities for the same files.

### Main-session responsibilities

Keep architectural decisions, cross-module implementation, complex optimization, and final integration in the main session.

Do not delegate a task merely because a subagent exists. Directly answer trivial questions when that is cheaper and simpler.

Before implementing a fix, assess whether the delegated findings are sufficient and consistent with the source code.

## 4. Context and token efficiency

- Prefer targeted searches and relevant file excerpts.
- Avoid repeatedly reading entire files when only a small section matters.
- Do not load unrelated documentation, MCP tools, or project directories without a reason.
- Ask subagents for concise, actionable reports rather than full investigation transcripts.
- Avoid redundant summaries of information already present in the current context.
- Use lower-effort models for routine, bounded tasks and reserve stronger reasoning for work that benefits from it.
- Do not launch multiple subagents to answer the same question.
- Stop investigating once sufficient evidence is available.

Efficiency must not come at the expense of correctness.

## 5. Uma Musume domain correctness

When implementing lineage, inheritance, affinity, aptitude, skill, or training logic:

- Identify the authoritative source of each game mechanic.
- Distinguish confirmed game rules from assumptions, approximations, and community-derived findings.
- Preserve the meaning and provenance of imported game data.
- Do not invent skill effects, compatibility rules, inheritance values, or character attributes.
- Use existing domain documentation and data sources before implementing new calculations.
- Verify how the current application represents characters, parents, grandparents, skills, and track conditions.
- Make important scoring assumptions explicit and testable.
- Keep game mechanics separate from presentation logic where appropriate.
- Ensure that missing data is handled deliberately rather than silently treated as a valid zero or positive match.

If sources disagree, document the discrepancy and avoid silently choosing an arbitrary interpretation.

## 6. Architecture and implementation

- Follow the repository's existing conventions and established architecture.
- Prefer small, focused changes over unnecessary rewrites.
- Reuse existing utilities, types, components, and dependencies where appropriate.
- Avoid introducing abstractions that are not justified by the current requirements.
- Keep data transformations and scoring logic testable.
- Preserve existing interfaces unless the task requires a deliberate change.
- Handle errors explicitly and provide useful diagnostics.
- Avoid unrelated refactors, formatting changes, or dependency upgrades.
- Do not add dependencies without a clear benefit.
- Do not duplicate logic that already exists elsewhere in the repository.

Before implementing a larger feature, briefly establish the relevant data flow and identify which modules need to change.

## 7. Testing and verification

Before changing code, identify the relevant existing tests and the project's supported test commands.

After making changes:

1. Run the narrowest relevant test first.
2. Run type checking or linting if configured and relevant.
3. Expand verification when the scope or risk warrants it.
4. Inspect the final diff.
5. Report exactly what was verified and what remains untested.

Never claim that a test, build, or type check passed unless it actually completed successfully.

Do not weaken existing tests to make a change appear successful.

Do not run destructive tests, migrations, deployments, or commands that modify external services without explicit authorization.

If the repository has no suitable test coverage for the changed behavior, consider adding focused regression tests.

## 8. Data integrity and external services

- Treat imported game data and external responses as potentially incomplete or inconsistent.
- Validate input at appropriate boundaries.
- Do not silently discard unknown or unsupported values.
- Preserve identifiers and relationships needed to reconstruct a lineage.
- Avoid unnecessary network requests and repeated data downloads.
- Never expose API keys, credentials, or private environment variables.
- Do not modify production databases, remote services, or external resources without explicit authorization.

## 9. Git and file safety

- Inspect the working tree before making changes.
- Preserve unrelated user modifications.
- Do not reset, discard, or overwrite existing user work.
- Do not commit, push, rebase, or rewrite Git history unless explicitly requested.
- Do not edit generated files when their source files should be changed instead.
- Avoid broad automated edits when a focused change will suffice.

## 10. Completion report

For implementation tasks, finish with a concise report containing:

- What changed and why.
- The main files modified.
- Tests and checks actually executed.
- Results and any known limitations.
- Important assumptions or follow-up work.

## Uma Musume Skills and domain knowledge

The repository contains specialized Uma Musume Skills under `.claude/skills/`.

Available Skills:
- `inheritance-mechanics/`
- `lineage-optimization/`
- `mechanics-evidence/`
- `parent-farming/`
- `parenting-mechanics/`
- `uma-parenting/`

### Skill selection

Before implementing, debugging, or testing Uma Musume game mechanics:

1. Identify the mechanic or workflow involved.
2. Inspect the relevant Skill's `SKILL.md` and follow any linked references needed for the task.
3. Load only the relevant documentation rather than reading every Skill by default.
4. Use `mechanics-evidence` when a claim needs verification, source evaluation, or confidence assessment.
5. Use `inheritance-mechanics` and `parenting-mechanics` for relevant inheritance and compatibility behavior.
6. Use `lineage-optimization` when evaluating or improving lineage selection and scoring.
7. Use `parent-farming` for parent acquisition and farming workflows.
8. Use `uma-parenting` for general parenting workflows, subject to the scope defined in its own documentation.

The folder names are organizational hints, not proof that a Skill covers a particular rule. Check its actual description and content before relying on it.

### Domain correctness

- Never invent game mechanics, inheritance effects, compatibility values, or optimization rules.
- Distinguish verified mechanics from assumptions and approximations.
- Prefer documented evidence over unsupported assumptions.
- If Skills disagree, investigate the discrepancy and identify the most authoritative evidence available.
- Do not silently resolve conflicts by choosing whichever rule is easiest to implement.
- When a mechanic is unclear, report the uncertainty before implementing it.
- Keep detailed domain knowledge in the Skills rather than duplicating it in this file.

### Subagent requirements

- For mechanic-related investigations, instruct `code-investigator` to consult the relevant Skill.
- For mechanic-related bugs, instruct `bug-investigator` to compare the implementation against the relevant Skill and evidence.
- For mechanic-related tests, instruct `test-writer` to derive expected behavior from the relevant Skill and verified requirements.
- Explicitly identify the relevant Skill when delegating a task. Do not assume a subagent has inherited all context loaded by the main session.

For investigation-only tasks, provide the direct answer, supporting file paths, relevant line numbers, and uncertainties.

Do not repeat the entire investigation history or provide a long summary of unchanged code.

