import { Logger } from '../utils/logger';
import { SUPPORTED_LANGUAGES } from '../utils/addSpecsQuestions';
import { getFrameworksForLanguage } from '../utils/frameworks';
import { targetsInSpecs } from '../core/render';

export interface ListOptions {
  lang?: string;
  verbose: boolean;
}

/** The languages and frameworks the setup questions offer, read from their lists (BL-200, REQ-002.A.4). */
export async function listCommand(options: ListOptions) {
  const logger = new Logger();

  try {
    if (options.lang !== undefined && !SUPPORTED_LANGUAGES.includes(options.lang)) {
      logger.displayError('Unsupported Language', `Language "${options.lang}" is not supported\n\n💡 Supported languages: ${SUPPORTED_LANGUAGES.join(', ')}`, false);
      process.exit(1);
    }
    const languages = options.lang ? [options.lang] : SUPPORTED_LANGUAGES;
    const files = options.verbose
      ? targetsInSpecs('rest').map(f => (f.endsWith('/api.yaml') ? `${f} (unless the API paradigm is none)` : f))
      : undefined;
    logger.displayLanguages(languages.map(language => ({ language, frameworks: getFrameworksForLanguage(language) })), files);
  } catch (error) {
    logger.displayError('Failed to List Languages', error instanceof Error ? error.message : 'Unknown error', false);
    process.exit(1);
  }
}
