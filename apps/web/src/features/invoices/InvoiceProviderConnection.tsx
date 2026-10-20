import { useEffect, useState } from 'react';
import { ApiError } from '../../lib/api';
import {
  useDisconnectInvoicingConnection,
  useInvoicingConnection,
  useSaveInvoicingConnection,
  type InvoiceEnvironment,
} from '../../lib/queries';
import { Button } from '../../components/ui/Button';
import { ErrorNotice, InfoNotice, Loading } from '../../components/ui/Feedback';
import { SelectField, TextField } from '../../components/ui/Field';

export function InvoiceProviderConnection() {
  const connection = useInvoicingConnection();
  const save = useSaveInvoicingConnection();
  const disconnect = useDisconnectInvoicingConnection();
  const [apiKey, setApiKey] = useState('');
  const [environment, setEnvironment] = useState<InvoiceEnvironment>('homologacion');
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (connection.data) setEnvironment(connection.data.environment);
  }, [connection.data?.environment]);

  if (connection.isLoading || !connection.data) return <Loading />;
  if (!connection.data.available) return null;

  function submit(event: React.FormEvent) {
    event.preventDefault();
    setError(null);
    save.mutate(
      { apiKey: apiKey.trim() || undefined, environment },
      {
        onSuccess: () => setApiKey(''),
        onError: (caught) =>
          setError(caught instanceof ApiError ? caught.message : 'No pudimos conectar la cuenta.'),
      },
    );
  }

  function removeConnection() {
    setError(null);
    disconnect.mutate(undefined, {
      onError: (caught) =>
        setError(caught instanceof ApiError ? caught.message : 'No pudimos desconectar la cuenta.'),
    });
  }

  const isConnected = connection.data.configured && !connection.data.reconnectRequired;

  return (
    <section className="flex flex-col gap-4 rounded-xl border border-line bg-surface p-5">
      <div>
        <h2 className="text-xl font-bold text-ink-900">Conectá tu facturación</h2>
        <p className="mt-1 text-sm text-ink-600">
          Usá tu propia cuenta de ARCA {'{API}'} para que Avisar emita con el CUIT de este espacio.
          Si trabajan como consultorio y factura una sola persona, configuren acá ese CUIT emisor.
        </p>
      </div>

      <InfoNotice>
        En <a className="font-semibold underline" href="https://arca.api.com.ar/" target="_blank" rel="noreferrer">ARCA {'{API}'}</a>,
        creá tu cuenta, registrá tu CUIT y certificado, y generá una API key con permiso de lectura y escritura.
        Pegá solo esa API key acá. No ingreses tu Clave Fiscal ni archivos de certificado.
      </InfoNotice>

      {isConnected && (
        <p className="text-sm font-semibold text-brand-700">
          Cuenta conectada · entorno {connection.data.environment}
        </p>
      )}
      {connection.data.reconnectRequired && (
        <ErrorNotice message="No pudimos leer la conexión guardada. Volvé a ingresar la API key." />
      )}
      {error && <ErrorNotice message={error} />}

      <form onSubmit={submit} className="flex flex-col gap-4">
        <TextField
          label="API key de ARCA {API}"
          type="password"
          autoComplete="new-password"
          value={apiKey}
          onChange={(event) => setApiKey(event.target.value)}
          placeholder={isConnected ? 'Dejala vacía para conservar la clave actual' : 'Pegá tu API key'}
          required={!isConnected}
          hint="La clave se cifra en el servidor y no se vuelve a mostrar."
        />

        <SelectField
          label="Entorno de facturación"
          value={environment}
          onChange={(event) => setEnvironment(event.target.value as InvoiceEnvironment)}
          hint="Usá homologación para probar. Producción emite comprobantes fiscales reales."
        >
          <option value="homologacion">Homologación · pruebas</option>
          <option value="produccion">Producción · facturas reales</option>
        </SelectField>

        <div className="flex flex-wrap gap-2">
          <Button type="submit" size="lg" loading={save.isPending}>
            {isConnected ? 'Guardar conexión' : 'Conectar cuenta'}
          </Button>
          {isConnected && (
            <Button
              type="button"
              variant="secondary"
              size="lg"
              loading={disconnect.isPending}
              onClick={removeConnection}
            >
              Desconectar
            </Button>
          )}
        </div>
      </form>
    </section>
  );
}
