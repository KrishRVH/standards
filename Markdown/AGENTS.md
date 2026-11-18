# Markdown instructions

Write instructions and reference material so an agent can find the relevant
section, read it as plain text, and act without rendering the page.

## Organize by task or decision

- Start a standalone document with one `#` title that names its subject. In
  the first paragraph, state when to use it and what result it describes.
- Name each section for its task, condition, or question. Make the heading
  unique within the document and specific enough to stand alone, such as
  `Install on Linux`.
  Keep prerequisites, instructions, exceptions, and success criteria together
  so the section still works when retrieved on its own.
- Put always-applicable constraints in the entry document. For a specialized
  case, say when to follow the link and point to the file or heading that owns
  the detail. Keep one source for each rule.
- Name files, commands, config keys, and symbols exactly. When an agent must
  open a repository file, link to it relative to the document. Put link and
  image destinations inline so they travel with the retrieved section.
  Use link text that identifies the destination.

## Write executable instructions

- For a procedure, state the working directory and prerequisites, list steps
  in execution order, and give an observable success condition. Identify
  placeholders and the conditions that select different commands.
- Label fenced examples with the language or `text` for literal output.
  Separate commands from their output. Keep essential instructions in the
  source text even when a diagram or image illustrates them.
- In MDX, put instructions inside literal JSX children. Use literal props for
  presentation. Write the result of a computation into the document when an
  agent needs that result to act.
- Remove repeated summaries and background that cannot change the next
  decision. Use optional YAML metadata only when a consumer reads it.
