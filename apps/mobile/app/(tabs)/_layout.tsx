import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors, type } from '../../lib/theme';

function TabGlyph({ glyph, focused }: { glyph: string; focused: boolean }) {
  return (
    <Text style={{ fontSize: 18, color: focused ? colors.accent : colors.textDim }}>{glyph}</Text>
  );
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerStyle: { backgroundColor: colors.bg },
        headerTintColor: colors.text,
        headerTitleStyle: { ...type.label, fontSize: 13 },
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopWidth: 3,
          borderTopColor: colors.line,
          height: 64,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: { ...type.label, fontSize: 9 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{ title: 'CHAT', tabBarIcon: ({ focused }) => <TabGlyph glyph="◤" focused={focused} /> }}
      />
      <Tabs.Screen
        name="story"
        options={{ title: 'STORY', tabBarIcon: ({ focused }) => <TabGlyph glyph="◉" focused={focused} /> }}
      />
      <Tabs.Screen
        name="nearby"
        options={{ title: 'SEKITAR', tabBarIcon: ({ focused }) => <TabGlyph glyph="◎" focused={focused} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: 'SETELAN', tabBarIcon: ({ focused }) => <TabGlyph glyph="≡" focused={focused} /> }}
      />
    </Tabs>
  );
}
