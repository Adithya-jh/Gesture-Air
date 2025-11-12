export async function getAudio(): Promise<any> {
  try {
    const mod: any = await import('expo-av');
    return mod.Audio;
  } catch {
    throw new Error('expo-av is not installed. Run `npx expo install expo-av`.');
  }
}

