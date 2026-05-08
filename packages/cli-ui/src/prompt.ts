/**
 * Re-export of @clack/prompts with the Mustard brand voice baked in.
 *
 * Consumers use:
 *   import { prompt } from '@pram1t/mustard-cli-ui';
 *   const name = await prompt.text({ message: 'field name?' });
 *   const ok = await prompt.confirm({ message: 'approve?' });
 */

import * as clack from '@clack/prompts';

export const prompt = {
  text: clack.text,
  confirm: clack.confirm,
  select: clack.select,
  multiselect: clack.multiselect,
  password: clack.password,
  spinner: clack.spinner,
  intro: clack.intro,
  outro: clack.outro,
  cancel: clack.cancel,
  isCancel: clack.isCancel,
  log: clack.log,
  note: clack.note,
} as const;
