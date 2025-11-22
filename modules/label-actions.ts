import { Alert, Linking, Platform } from 'react-native';

/** Normalize and try to launch a mapped deeplink for a label. */
export async function openAppForLabel(label: string) {
  try {
    const l = label.toLowerCase();
    if (l.includes('whatsapp')) {
      const url = 'whatsapp://send?text=Hello';
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
    }
    if (l.includes('maps') || l === 'm') {
      const url = Platform.OS === 'ios' ? 'maps://?q=coffee' : 'geo:0,0?q=coffee';
      return Linking.openURL(url);
    }
    if (l.includes('youtube')) {
      const url = 'vnd.youtube://';
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      return Linking.openURL('https://www.youtube.com');
    }
    if (l.includes('netflix')) {
      const url = 'nflx://www.netflix.com/browse';
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      return Linking.openURL('https://www.netflix.com');
    }
    if (l === 'x' || l.includes('twitter')) {
      const url = 'twitter://timeline';
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      return Linking.openURL('https://x.com');
    }
    if (l.includes('linkedin') || l.includes('linked in')) {
      const url = 'linkedin://';
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      return Linking.openURL('https://www.linkedin.com/feed');
    }
    if (l.includes('gmail') || l.includes('email')) {
      const gmailCompose = 'googlegmail://co';
      if (await Linking.canOpenURL(gmailCompose)) return Linking.openURL(gmailCompose);
      return Linking.openURL('mailto:');
    }
    if (l.includes('amazon')) {
      return Linking.openURL('https://www.amazon.com');
    }
    if (l.includes('reddit')) {
      const url = 'reddit://';
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      return Linking.openURL('https://www.reddit.com');
    }
    if (l.includes('threads')) {
      const url = 'threads://';
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      return Linking.openURL('https://www.threads.net');
    }
    if (l.includes('discord')) {
      const url = 'discord://';
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      return Linking.openURL('https://discord.com/channels/@me');
    }
    if (l.includes('gpay') || l.includes('google pay')) {
      const url = 'gpay://';
      if (await Linking.canOpenURL(url)) return Linking.openURL(url);
      return Linking.openURL('https://pay.google.com');
    }
    if (l.includes('web') || l.includes('google') || l.includes('browser')) {
      return Linking.openURL('https://www.google.com');
    }
    Alert.alert('Action', `No action mapped for "${label}".`);
  } catch (err: any) {
    Alert.alert('Open failed', err?.message ?? String(err));
  }
}
