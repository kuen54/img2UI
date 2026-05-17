import type { AppConfig } from '../types'
import {
  DEFAULT_PASS1_LAYOUT,
  DEFAULT_PASS2_EXTRACT,
  DEFAULT_PASS2_VALIDATE,
  DEFAULT_CODING_AGENT_INTRO,
} from './default-prompts'
import { buildDefaultProviders } from './default-providers'
import os from 'node:os'
import path from 'node:path'

export const APP_CONFIG_VERSION = '0.1.0'

export function buildDefaultAppConfig(): AppConfig {
  return {
    version: APP_CONFIG_VERSION,
    providers: buildDefaultProviders(),
    prompts: {
      pass1_layout: DEFAULT_PASS1_LAYOUT,
      pass2_extract: DEFAULT_PASS2_EXTRACT,
      pass2_validate: DEFAULT_PASS2_VALIDATE,
      coding_agent_intro: DEFAULT_CODING_AGENT_INTRO,
    },
    settings: {
      auto_run_pass1_on_upload: true,
      auto_run_validation_after_pass2: true,
      default_export_dir: path.join(os.homedir(), 'img2ui-out'),
    },
  }
}
