import React from 'react';
import { StatusBar } from 'expo-status-bar';
import { View } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { DarkTheme, NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useFonts } from 'expo-font';
import { Fraunces_400Regular, Fraunces_500Medium } from '@expo-google-fonts/fraunces';
import { Inter_300Light, Inter_400Regular, Inter_500Medium, Inter_600SemiBold } from '@expo-google-fonts/inter';

import { WelcomeScreen } from './src/screens/WelcomeScreen';
import { ConnectScreen } from './src/screens/ConnectScreen';
import { ChatScreen } from './src/screens/ChatScreen';
import { ConnectionsScreen } from './src/screens/ConnectionsScreen';
import { color } from './src/theme';
import type { RootStackParamList } from './src/types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navTheme = {
  ...DarkTheme,
  colors: { ...DarkTheme.colors, background: color.bgBase, card: color.bgBase },
};

export default function App() {
  const [loaded] = useFonts({
    Fraunces_400Regular,
    Fraunces_500Medium,
    Inter_300Light,
    Inter_400Regular,
    Inter_500Medium,
    Inter_600SemiBold,
  });

  if (!loaded) return <View style={{ flex: 1, backgroundColor: color.bgBase }} />;

  return (
    <SafeAreaProvider>
      <StatusBar style="light" />
      <NavigationContainer theme={navTheme}>
        <Stack.Navigator
          initialRouteName="Welcome"
          screenOptions={{
            headerShown: false,
            contentStyle: { backgroundColor: color.bgBase },
            animation: 'fade',
          }}
        >
          <Stack.Screen name="Welcome" component={WelcomeScreen} />
          <Stack.Screen name="Connect" component={ConnectScreen} />
          <Stack.Screen name="Chat" component={ChatScreen} />
          <Stack.Screen name="Connections" component={ConnectionsScreen} options={{ animation: 'slide_from_right' }} />
        </Stack.Navigator>
      </NavigationContainer>
    </SafeAreaProvider>
  );
}
