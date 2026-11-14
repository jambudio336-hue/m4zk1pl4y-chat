import { Tabs } from 'expo-router';
import { Text } from 'react-native';
import { colors } from '../../lib/theme';

function TabGlyph({ glyph, focused }: { glyph: string; focused: boolean }) {
  return <Text style={{ fontSize: 19, color: focused ? colors.accent : colors.textDim, fontWeight: focused ? '800' : '500' }}>{glyph}</Text>;
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: colors.panel,
          borderTopWidth: 1,
          borderTopColor: colors.lineDim,
          height: 66,
          paddingTop: 7,
          paddingBottom: 8,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textDim,
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700', marginTop: 2 },
      }}
    >
      <Tabs.Screen name="index" options={{ title: 'Chat', tabBarIcon: ({ focused }) => <TabGlyph glyph="▤" focused={focused} /> }} />
      <Tabs.Screen name="friends" options={{ title: 'Teman', tabBarIcon: ({ focused }) => <TabGlyph glyph="♧" focused={focused} /> }} />
      <Tabs.Screen name="story" options={{ title: 'Status', tabBarIcon: ({ focused }) => <TabGlyph glyph="◉" focused={focused} /> }} />
      <Tabs.Screen name="nearby" options={{ title: 'Sekitar', tabBarIcon: ({ focused }) => <TabGlyph glyph="◎" focused={focused} /> }} />
      <Tabs.Screen name="settings" options={{ title: 'Profil', tabBarIcon: ({ focused }) => <TabGlyph glyph="◌" focused={focused} /> }} />
    </Tabs>
  );
}
