import { Tabs } from 'expo-router';
import React from 'react';

import { HapticTab } from '@/components/haptic-tab';
import { IconSymbol } from '@/components/ui/icon-symbol';
import { Colors } from '@/constants/theme';
import { useColorScheme } from '@/hooks/use-color-scheme';

export default function TabLayout() {
  const colorScheme = useColorScheme();

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: Colors[colorScheme ?? 'light'].tint,
        headerShown: false,
        tabBarButton: HapticTab,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: 'Home',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="house.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="explore"
        options={{
          title: 'Explore',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={28} name="paperplane.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="../gesture"
        options={{
          title: 'Recorder',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="hand.raised.fill" color={color} />
          ),
        }}
      />
      <Tabs.Screen
        name="../ml"
        options={{
          title: 'ML',
          tabBarIcon: ({ color }) => (
            <IconSymbol size={26} name="brain.head.profile" color={color} />
          ),
        }}
      />
    </Tabs>
  );
}
