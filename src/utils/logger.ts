import chalk from 'chalk';

export class Logger {
  private readonly logo = [

    
    '  █████████                              ███████████   ███  ████            █████   ',
    ' ███░░░░░███                            ░░███░░░░░███ ░░░  ░░███           ░░███    ',
    '░███    ░░░  ████████   ██████   ██████  ░███    ░███ ████  ░███   ██████  ███████  ',
    '░░█████████ ░░███░░███ ███░░███ ███░░███ ░██████████ ░░███  ░███  ███░░███░░░███░   ',
    ' ░░░░░░░░███ ░███ ░███░███████ ░███ ░░░  ░███░░░░░░   ░███  ░███ ░███ ░███  ░███    ',
    ' ███    ░███ ░███ ░███░███░░░  ░███  ███ ░███         ░███  ░███ ░███ ░███  ░███ ███',
    '░░█████████  ░███████ ░░██████ ░░██████  █████        █████ █████░░██████   ░░█████ ',
    ' ░░░░░░░░░   ░███░░░   ░░░░░░   ░░░░░░  ░░░░░        ░░░░░ ░░░░░  ░░░░░░     ░░░░░  ',
    '             ░███                                                                   ',
    '             █████                                                                  ',
    '            ░░░░░                                                                   ',
  ];

  info(message: string): void {
    console.log(chalk.blue(message));
  }
  
  success(message: string): void {
    console.log(chalk.green(message));
  }
  
  warn(message: string): void {
    console.log(chalk.yellow(message));
  }
  
  error(message: string): void {
    console.error(chalk.red(message));
  }
  
  debug(message: string): void {
    if (process.env.DEBUG) {
      console.log(chalk.gray(message));
    }
  }

  // Display with logo on top and content below
  displayWithLogo(content: string[]): void {
    // First print the logo
    console.log(chalk.blue(this.logo.join('\n')));
    
    // Then print a separator line
    console.log('');
    
    // Then print the content
    console.log(content.join('\n'));
  }

  // Welcome message with logo
  displayWelcome(): void {
    const content = [
      chalk.blue.bold('SpecPilot CLI v1.2.2'),
      '',
      chalk.green('✓ Welcome to Specification-Driven Development'),
      '',
      chalk.cyan('Available Commands:'),
      chalk.white('  • init     - Initialize new SDD project'),
      chalk.white('  • validate - Validate project specifications'),
      chalk.white('  • add-specs- Add specs to existing project'),
      chalk.white('  • list     - Show available templates'),
      '',
      chalk.yellow('⚠️  Tip: Use --help for detailed command options'),
      '',
      chalk.gray('Ready for your next project! 🚀')
    ];

    this.displayWithLogo(content);
  }

  // Validation results with logo
  displayValidationResults(isValid: boolean, errors: string[], warnings: string[], summary?: { filesChecked: number; errors: number; warnings: number; mandatesVerified: number }): void {
    const content = [
      chalk.blue.bold('Validation Results'),
      '',
      isValid ? chalk.green('✅ All specifications are valid!') : chalk.red('❌ Validation failed!'),
      ''
    ];

    if (warnings.length > 0) {
      content.push(chalk.yellow('⚠️  Warnings:'));
      warnings.forEach(warning => {
        content.push(chalk.yellow(`  • ${warning}`));
      });
      content.push('');
    }

    if (errors.length > 0) {
      content.push(chalk.red('🚫 Errors:'));
      errors.forEach(error => {
        content.push(chalk.red(`  • ${error}`));
      });
      content.push('');
    }

    if (summary) {
      content.push(chalk.blue('📊 Validation Summary:'));
      content.push(`  Files checked: ${summary.filesChecked}`);
      content.push(`  Errors: ${summary.errors}`);
      content.push(`  Warnings: ${summary.warnings}`);
      content.push(`  Mandates verified: ${summary.mandatesVerified}`);
    }

    this.displayWithLogo(content);
  }

  // Template list with logo
  displayTemplates(templates: Array<{ language: string; name: string; framework?: string; description: string; files: string[] }>, verbose: boolean): void {
    const content = [
      chalk.blue.bold('Available Templates'),
      ''
    ];

    // Group templates by language
    const grouped = templates.reduce((acc, template) => {
      if (!acc[template.language]) {
        acc[template.language] = [];
      }
      acc[template.language].push(template);
      return acc;
    }, {} as Record<string, typeof templates>);

    Object.entries(grouped).forEach(([language, langTemplates]) => {
      content.push(chalk.blue(`📦 ${language.toUpperCase()}`));

      langTemplates.forEach(template => {
        const name = template.framework ?
          `${template.name} (${template.framework})` :
          template.name;

        if (verbose) {
          content.push(chalk.green(`  ✓ ${name}`));
          content.push(chalk.gray(`    Description: ${template.description}`));
          content.push(chalk.gray(`    Files: ${template.files.join(', ')}`));
        } else {
          content.push(chalk.green(`  ✓ ${name} - ${template.description}`));
        }
      });
      content.push('');
    });

    this.displayWithLogo(content);
  }

  // Project initialization success with logo
  displayInitSuccess(projectName: string, targetDir: string, specsPath: string): void {
    const content = [
      chalk.blue('🚀 Initializing SDD project...'),
      '',
      chalk.blue.bold('Project Initialized Successfully!'),
      '',
      chalk.green(`✅ Project "${projectName}" created`),
      chalk.white(`📁 Location: ${targetDir}`),
      chalk.white(`📋 Specs: ${specsPath}`),
      '',
      chalk.cyan('🚀 Next steps to populate your specs with AI:'),
      chalk.white('1. Open .specs/README.md for full guidance'),
      chalk.white('2. Copy the onboarding prompt from .specs/development/prompts.md'),
      chalk.white('3. Paste into your AI agent and run it'),
      chalk.white('4. Review the generated spec files'),
      '',
      chalk.gray('Your project is now ready for AI-assisted development!')
    ];

    this.displayWithLogo(content);
  }

  // Error display with logo
  displayError(title: string, message: string, showInitMessage: boolean = true): void {
    const content = [];
    
    if (showInitMessage) {
      content.push(chalk.blue('🚀 Initializing SDD project...'));
      content.push('');
    }
    
    content.push(chalk.red.bold(title));
    content.push('');
    content.push(chalk.red(message));

    this.displayWithLogo(content);
  }

  // Info display with logo
  displayInfo(title: string, message: string): void {
    const content = [
      chalk.blue.bold(title),
      '',
      chalk.white(message)
    ];

    this.displayWithLogo(content);
  }
}