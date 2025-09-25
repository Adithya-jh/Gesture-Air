import { Link } from 'expo-router';
import { View, Button } from 'react-native';
export default function ExploreScreen() {
  return (
    <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
      {/* your explore UI here */}
      <Link href="/gesture" asChild>
        <Button title="Open Gesture Recorder" />
      </Link>
    </View>
  );
}
