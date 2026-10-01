import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { setupNativeApp } from '@/lib/native';

/** Liga os ajustes do app de celular (não faz nada no navegador). */
export default function NativeShell() {
  const navigate = useNavigate();
  useEffect(() => { setupNativeApp(() => navigate(-1)); }, [navigate]);
  return null;
}
