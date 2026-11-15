// Donne le résultat d'une génération (le site la demande toutes les 2 secondes).
import { getStore } from '@netlify/blobs';

const SANS_CACHE = { 'Cache-Control': 'no-store' };

export default async (req) => {
  const id = new URL(req.url).searchParams.get('id') || '';
  if (!/^[a-z0-9]{8,40}$/i.test(id)) {
    return Response.json({ statut: 'erreur', error: 'Identifiant invalide.' }, { status: 400, headers: SANS_CACHE });
  }
  try {
    const valeur = await getStore('jeux').get(id, { type: 'json' });
    if (!valeur) return Response.json({ statut: 'attente' }, { headers: SANS_CACHE });
    return Response.json(valeur, { headers: SANS_CACHE });
  } catch (e) {
    return Response.json({ statut: 'attente' }, { headers: SANS_CACHE });
  }
};
