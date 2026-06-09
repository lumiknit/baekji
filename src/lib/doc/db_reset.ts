export const fullResetDB = async () => {
  if (!indexedDB.databases) return;
  const all = await indexedDB.databases();
  await Promise.all(
    all
      .filter((db) => db.name?.startsWith('baekji-'))
      .map((db) => indexedDB.deleteDatabase(db.name!)),
  );
};
