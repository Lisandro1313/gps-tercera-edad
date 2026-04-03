import { useState, useEffect, useRef } from 'react';
import * as Location from 'expo-location';
import { Coordenada } from '../utils/routing';

export function useGPS() {
  const [posicion, setPosicion] = useState<Coordenada | null>(null);
  const [rumbo, setRumbo] = useState(0);
  const [permiso, setPermiso] = useState(false);
  const [error, setError] = useState('');
  const watchRef = useRef<Location.LocationSubscription | null>(null);

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        setError('Necesitamos permiso de ubicación para funcionar');
        return;
      }
      setPermiso(true);

      // Posición inicial rápida
      const loc = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.High });
      setPosicion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
      setRumbo(loc.coords.heading ?? 0);

      // Seguimiento en tiempo real
      watchRef.current = await Location.watchPositionAsync(
        { accuracy: Location.Accuracy.High, timeInterval: 2000, distanceInterval: 5 },
        (loc) => {
          setPosicion({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
          setRumbo(loc.coords.heading ?? 0);
        }
      );
    })();

    return () => { watchRef.current?.remove(); };
  }, []);

  return { posicion, rumbo, permiso, error };
}
