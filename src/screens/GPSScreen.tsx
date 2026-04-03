import React, { useState, useEffect, useRef } from 'react';
import {
  View, Text, TouchableOpacity, StyleSheet,
  TextInput, FlatList, ActivityIndicator, Modal,
} from 'react-native';
import MapView, { Marker, Polyline, PROVIDER_DEFAULT } from 'react-native-maps';
import * as Speech from 'expo-speech';
import { useGPS } from '../hooks/useGPS';
import {
  buscarDireccion, calcularRuta, Ruta, Coordenada,
  formatDistancia, formatDuracion, distanciaEntre, PasoRuta,
} from '../utils/routing';

type Estado = 'inicio' | 'buscando' | 'confirmando' | 'navegando';

export default function GPSScreen() {
  const { posicion, rumbo, permiso, error: gpsError } = useGPS();
  const mapRef = useRef<MapView>(null);

  const [estado, setEstado] = useState<Estado>('inicio');
  const [textoBusqueda, setTextoBusqueda] = useState('');
  const [resultados, setResultados] = useState<{ nombre: string; coordenada: Coordenada }[]>([]);
  const [destino, setDestino] = useState<{ nombre: string; coordenada: Coordenada } | null>(null);
  const [ruta, setRuta] = useState<Ruta | null>(null);
  const [cargando, setCargando] = useState(false);
  const [pasoActual, setPasoActual] = useState(0);
  const [instruccionActual, setInstruccionActual] = useState('');

  // Seguimiento durante navegación
  useEffect(() => {
    if (estado !== 'navegando' || !ruta || !posicion) return;

    // Centrar mapa en posición actual
    mapRef.current?.animateCamera({
      center: posicion,
      heading: rumbo,
      pitch: 45,
      zoom: 17,
    });

    // Ver si hay que avanzar al siguiente paso
    const paso = ruta.pasos[pasoActual];
    if (!paso) return;
    const dist = distanciaEntre(posicion, paso.coordenada);
    if (dist < 30 && pasoActual < ruta.pasos.length - 1) {
      const siguiente = pasoActual + 1;
      setPasoActual(siguiente);
      const instruccion = ruta.pasos[siguiente].instruccion;
      setInstruccionActual(instruccion);
      Speech.speak(instruccion, { language: 'es-AR', rate: 0.85, pitch: 1 });
    }
  }, [posicion]);

  const buscar = async () => {
    if (!textoBusqueda.trim()) return;
    setCargando(true);
    try {
      const res = await buscarDireccion(textoBusqueda);
      setResultados(res);
    } catch {
      setResultados([]);
    } finally {
      setCargando(false);
    }
  };

  const seleccionarDestino = async (dest: { nombre: string; coordenada: Coordenada }) => {
    setDestino(dest);
    setResultados([]);
    setEstado('confirmando');

    if (!posicion) return;
    setCargando(true);
    try {
      const r = await calcularRuta(posicion, dest.coordenada);
      setRuta(r);
      // Ajustar mapa para mostrar toda la ruta
      mapRef.current?.fitToCoordinates(r.coordenadas, {
        edgePadding: { top: 80, right: 40, bottom: 200, left: 40 },
        animated: true,
      });
    } catch {
      setRuta(null);
    } finally {
      setCargando(false);
    }
  };

  const iniciarNavegacion = () => {
    if (!ruta) return;
    setEstado('navegando');
    setPasoActual(0);
    const primera = ruta.pasos[0]?.instruccion || 'Iniciando navegación';
    setInstruccionActual(primera);
    Speech.speak(primera, { language: 'es-AR', rate: 0.85, pitch: 1 });
  };

  const cancelarNavegacion = () => {
    Speech.stop();
    setEstado('inicio');
    setDestino(null);
    setRuta(null);
    setPasoActual(0);
    setTextoBusqueda('');
  };

  if (!permiso && gpsError) {
    return (
      <View style={styles.errorContainer}>
        <Text style={styles.errorEmoji}>📍</Text>
        <Text style={styles.errorTexto}>{gpsError}</Text>
      </View>
    );
  }

  return (
    <View style={styles.container}>
      {/* Mapa */}
      <MapView
        ref={mapRef}
        style={styles.mapa}
        provider={PROVIDER_DEFAULT}
        showsUserLocation
        showsMyLocationButton={false}
        followsUserLocation={estado === 'navegando'}
        initialRegion={posicion ? {
          ...posicion,
          latitudeDelta: 0.01,
          longitudeDelta: 0.01,
        } : {
          latitude: -34.6037,
          longitude: -58.3816,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        }}
      >
        {destino && (
          <Marker coordinate={destino.coordenada} title="Destino" pinColor="red" />
        )}
        {ruta && (
          <Polyline
            coordinates={ruta.coordenadas}
            strokeColor="#2196F3"
            strokeWidth={6}
          />
        )}
      </MapView>

      {/* Panel superior — instrucción durante navegación */}
      {estado === 'navegando' && (
        <View style={styles.instruccionPanel}>
          <Text style={styles.instruccionTexto}>{instruccionActual}</Text>
          {ruta && (
            <Text style={styles.instruccionSub}>
              {formatDistancia(ruta.pasos[pasoActual]?.distancia ?? 0)} · {destino?.nombre.split(',')[0]}
            </Text>
          )}
        </View>
      )}

      {/* Panel inferior */}
      <View style={styles.panelInferior}>

        {/* ESTADO: INICIO — buscar destino */}
        {estado === 'inicio' && (
          <View style={styles.buscadorContainer}>
            <Text style={styles.buscadorTitulo}>📍 ¿A dónde vas?</Text>
            <View style={styles.buscadorRow}>
              <TextInput
                style={styles.buscadorInput}
                placeholder="Escribí la dirección..."
                placeholderTextColor="#999"
                value={textoBusqueda}
                onChangeText={setTextoBusqueda}
                onSubmitEditing={buscar}
                returnKeyType="search"
                autoCorrect={false}
              />
              <TouchableOpacity style={styles.buscadorBtn} onPress={buscar}>
                <Text style={styles.buscadorBtnText}>🔍</Text>
              </TouchableOpacity>
            </View>

            {cargando && <ActivityIndicator color="#2196F3" style={{ marginTop: 12 }} />}

            {resultados.length > 0 && (
              <FlatList
                data={resultados}
                keyExtractor={(_, i) => i.toString()}
                style={styles.resultadosList}
                renderItem={({ item }) => (
                  <TouchableOpacity
                    style={styles.resultadoItem}
                    onPress={() => seleccionarDestino(item)}
                  >
                    <Text style={styles.resultadoEmoji}>📌</Text>
                    <Text style={styles.resultadoTexto} numberOfLines={2}>
                      {item.nombre}
                    </Text>
                  </TouchableOpacity>
                )}
              />
            )}
          </View>
        )}

        {/* ESTADO: CONFIRMANDO — mostrar ruta calculada */}
        {estado === 'confirmando' && destino && (
          <View style={styles.confirmContainer}>
            {cargando ? (
              <View style={styles.calculandoRow}>
                <ActivityIndicator color="#2196F3" size="large" />
                <Text style={styles.calculandoTexto}>Calculando ruta...</Text>
              </View>
            ) : ruta ? (
              <>
                <Text style={styles.destinoNombre} numberOfLines={2}>
                  📍 {destino.nombre.split(',').slice(0, 2).join(',')}
                </Text>
                <View style={styles.rutaInfoRow}>
                  <View style={styles.rutaInfoItem}>
                    <Text style={styles.rutaInfoValor}>{formatDistancia(ruta.distanciaTotal)}</Text>
                    <Text style={styles.rutaInfoLabel}>Distancia</Text>
                  </View>
                  <View style={styles.rutaInfoDivider} />
                  <View style={styles.rutaInfoItem}>
                    <Text style={styles.rutaInfoValor}>{formatDuracion(ruta.duracionTotal)}</Text>
                    <Text style={styles.rutaInfoLabel}>Tiempo aprox.</Text>
                  </View>
                </View>
                <View style={styles.botonesRow}>
                  <TouchableOpacity style={styles.btnCancelar} onPress={cancelarNavegacion}>
                    <Text style={styles.btnCancelarText}>✕ Cancelar</Text>
                  </TouchableOpacity>
                  <TouchableOpacity style={styles.btnNavegar} onPress={iniciarNavegacion}>
                    <Text style={styles.btnNavegarText}>▶ Navegar</Text>
                  </TouchableOpacity>
                </View>
              </>
            ) : (
              <Text style={styles.errorRuta}>No se pudo calcular la ruta. Verificá tu conexión.</Text>
            )}
          </View>
        )}

        {/* ESTADO: NAVEGANDO */}
        {estado === 'navegando' && ruta && (
          <View style={styles.navegandoPanel}>
            <View style={styles.navegandoInfo}>
              <Text style={styles.navegandoDistancia}>
                {formatDistancia(ruta.distanciaTotal)}
              </Text>
              <Text style={styles.navegandoDuracion}>
                {formatDuracion(ruta.duracionTotal)} restante
              </Text>
            </View>
            <TouchableOpacity style={styles.btnDetener} onPress={cancelarNavegacion}>
              <Text style={styles.btnDetenerText}>⏹ Detener</Text>
            </TouchableOpacity>
          </View>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  mapa: { flex: 1 },
  errorContainer: {
    flex: 1, backgroundColor: '#0d1117',
    alignItems: 'center', justifyContent: 'center', padding: 40,
  },
  errorEmoji: { fontSize: 60, marginBottom: 16 },
  errorTexto: { color: '#888', fontSize: 18, textAlign: 'center' },

  // Instrucción navegando
  instruccionPanel: {
    position: 'absolute', top: 0, left: 0, right: 0,
    backgroundColor: '#1565C0', paddingTop: 52, paddingBottom: 16,
    paddingHorizontal: 20, elevation: 10,
  },
  instruccionTexto: { color: '#fff', fontSize: 22, fontWeight: '700' },
  instruccionSub: { color: '#90CAF9', fontSize: 15, marginTop: 4 },

  // Panel inferior
  panelInferior: {
    position: 'absolute', bottom: 0, left: 0, right: 0,
    backgroundColor: '#fff', borderTopLeftRadius: 24, borderTopRightRadius: 24,
    elevation: 20, shadowColor: '#000', shadowOffset: { width: 0, height: -4 },
    shadowOpacity: 0.15, shadowRadius: 12,
  },

  // Buscador
  buscadorContainer: { padding: 20 },
  buscadorTitulo: { fontSize: 22, fontWeight: '700', color: '#111', marginBottom: 12 },
  buscadorRow: { flexDirection: 'row', gap: 10 },
  buscadorInput: {
    flex: 1, backgroundColor: '#f5f5f5',
    borderRadius: 14, paddingHorizontal: 18, paddingVertical: 16,
    fontSize: 18, color: '#111', borderWidth: 1, borderColor: '#e0e0e0',
  },
  buscadorBtn: {
    backgroundColor: '#2196F3', borderRadius: 14,
    paddingHorizontal: 20, alignItems: 'center', justifyContent: 'center',
  },
  buscadorBtnText: { fontSize: 24 },
  resultadosList: { maxHeight: 220, marginTop: 8 },
  resultadoItem: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: '#f0f0f0',
  },
  resultadoEmoji: { fontSize: 20 },
  resultadoTexto: { flex: 1, fontSize: 16, color: '#333' },

  // Confirmar ruta
  confirmContainer: { padding: 20 },
  calculandoRow: { flexDirection: 'row', alignItems: 'center', gap: 14, paddingVertical: 20 },
  calculandoTexto: { fontSize: 18, color: '#555' },
  destinoNombre: { fontSize: 18, fontWeight: '700', color: '#111', marginBottom: 16 },
  rutaInfoRow: {
    flexDirection: 'row', backgroundColor: '#f5f5f5',
    borderRadius: 16, padding: 16, marginBottom: 16,
  },
  rutaInfoItem: { flex: 1, alignItems: 'center' },
  rutaInfoValor: { fontSize: 26, fontWeight: '700', color: '#1565C0' },
  rutaInfoLabel: { fontSize: 14, color: '#888', marginTop: 4 },
  rutaInfoDivider: { width: 1, backgroundColor: '#ddd' },
  botonesRow: { flexDirection: 'row', gap: 12 },
  btnCancelar: {
    flex: 1, paddingVertical: 18, borderRadius: 16,
    backgroundColor: '#f5f5f5', alignItems: 'center',
  },
  btnCancelarText: { fontSize: 18, color: '#888', fontWeight: '600' },
  btnNavegar: {
    flex: 2, paddingVertical: 18, borderRadius: 16,
    backgroundColor: '#2196F3', alignItems: 'center',
  },
  btnNavegarText: { fontSize: 20, color: '#fff', fontWeight: '700' },
  errorRuta: { color: '#E74C3C', fontSize: 16, textAlign: 'center', padding: 20 },

  // Navegando
  navegandoPanel: {
    flexDirection: 'row', alignItems: 'center',
    padding: 20, gap: 16,
  },
  navegandoInfo: { flex: 1 },
  navegandoDistancia: { fontSize: 28, fontWeight: '700', color: '#111' },
  navegandoDuracion: { fontSize: 16, color: '#888', marginTop: 2 },
  btnDetener: {
    backgroundColor: '#E53935', paddingHorizontal: 24,
    paddingVertical: 16, borderRadius: 16,
  },
  btnDetenerText: { color: '#fff', fontSize: 18, fontWeight: '700' },
});
