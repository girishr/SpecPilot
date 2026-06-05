export function getFrameworksForLanguage(language: string): string[] {
  const frameworks: Record<string, string[]> = {
    typescript: ['react', 'express', 'next', 'nest', 'vue', 'angular'],
    python: ['fastapi', 'django', 'flask', 'streamlit'],
    kotlin: ['android', 'spring', 'ktor', 'compose'],
    swift: ['ios', 'swiftui', 'vapor']
  };

  return frameworks[language] || [];
}
