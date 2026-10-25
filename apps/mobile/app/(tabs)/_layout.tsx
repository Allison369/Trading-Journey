/**
 * The five-tab shell.
 *
 * Icons are drawn with the same inline-SVG approach as the charts, so there is
 * no icon-font dependency to keep in sync and every glyph inherits the theme
 * colour.
 */

import { Tabs } from "expo-router";
import Svg, { Path } from "react-native-svg";
import { useTheme } from "../../src/state/themeContext";

function TabIcon({ path, colour, filled }: { path: string; colour: string; filled?: boolean }) {
  return (
    <Svg width={22} height={22} viewBox="0 0 24 24">
      <Path
        d={path}
        stroke={colour}
        strokeWidth={1.9}
        strokeLinecap="round"
        strokeLinejoin="round"
        fill={filled ? colour : "none"}
      />
    </Svg>
  );
}

const ICONS = {
  dashboard: "M3 12l9-8 9 8v8a1 1 0 01-1 1h-5v-6H9v6H4a1 1 0 01-1-1z",
  trades: "M4 6h16M4 12h16M4 18h10",
  add: "M12 5v14M5 12h14",
  analytics: "M4 20V10M10 20V4M16 20v-7M22 20H2",
  journal: "M6 3h11a2 2 0 012 2v16H6a2 2 0 01-2-2V5a2 2 0 012-2zm2 5h7M8 12h7M8 16h4",
};

export default function TabsLayout() {
  const theme = useTheme();

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarStyle: {
          backgroundColor: theme.surface,
          borderTopColor: theme.border,
          borderTopWidth: 1,
          paddingTop: 6,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: "600", letterSpacing: 0.1 },
        tabBarItemStyle: { paddingVertical: 2 },
        tabBarActiveTintColor: theme.accentText,
        tabBarInactiveTintColor: theme.textFaint,
        sceneStyle: { backgroundColor: theme.background },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Dashboard",
          tabBarIcon: ({ color }) => <TabIcon path={ICONS.dashboard} colour={color} />,
        }}
      />
      <Tabs.Screen
        name="trades"
        options={{
          title: "Trades",
          tabBarIcon: ({ color }) => <TabIcon path={ICONS.trades} colour={color} />,
        }}
      />
      <Tabs.Screen
        name="add"
        options={{
          title: "Add",
          tabBarIcon: ({ color }) => <TabIcon path={ICONS.add} colour={color} />,
        }}
      />
      <Tabs.Screen
        name="analytics"
        options={{
          title: "Stats",
          tabBarIcon: ({ color }) => <TabIcon path={ICONS.analytics} colour={color} />,
        }}
      />
      <Tabs.Screen
        name="journal"
        options={{
          title: "Journal",
          tabBarIcon: ({ color }) => <TabIcon path={ICONS.journal} colour={color} />,
        }}
      />
    </Tabs>
  );
}
