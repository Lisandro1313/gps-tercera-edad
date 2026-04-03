import { StatusBar } from 'expo-status-bar';
import GPSScreen from './src/screens/GPSScreen';

export default function App() {
  return (
    <>
      <StatusBar style="dark" />
      <GPSScreen />
    </>
  );
}
