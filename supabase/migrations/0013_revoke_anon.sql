-- =============================================================================
-- 0013 — Retrait des privileges du role anon
--
-- Selon la version du projet, Supabase accorde par defaut select/insert/update/
-- delete au role `anon` sur les nouvelles tables du schema public. Aucune donnee
-- ne fuit pour autant : toutes nos policies ciblent `authenticated`, si bien
-- qu'un appel anonyme ne satisfait aucune policy et repart les mains vides.
--
-- On ne s'appuie pas sur cette absence de policy. Un oubli de `to authenticated`
-- dans une migration future suffirait a ouvrir une table au public. Le retrait
-- explicite des privileges ferme la porte un cran plus bas, independamment des
-- policies.
--
-- L'application n'a aucun besoin anonyme : la connexion passe par les endpoints
-- /auth/v1, jamais par PostgREST.
-- =============================================================================

revoke all on all tables in schema public from anon;
revoke all on all sequences in schema public from anon;
revoke all on all functions in schema public from anon;
revoke all on schema public from anon;

-- Les objets crees par les migrations suivantes heritent de la meme regle.
alter default privileges in schema public revoke all on tables from anon;
alter default privileges in schema public revoke all on sequences from anon;
alter default privileges in schema public revoke all on functions from anon;

-- Le schema prive n'a jamais ete expose ; on le verrouille explicitement.
revoke all on schema private from anon;

do $$
begin
  raise notice 'Privileges du role anon retires du schema public.';
end
$$;
