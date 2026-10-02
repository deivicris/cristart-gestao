# CristART 3D — Sistema de Gestão

Sistema interno da CristART 3D (produtos, custos, filamentos, insumos, equipamentos).
Acesso restrito: login pelo Supabase, e só e-mails da tabela `membros` entram.

- `index.html`, `css/`, `js/` — o app (roda direto no navegador, sem build)
- `js/config.js` — endereço e chave **pública** do Supabase (a chave secreta nunca vai aqui)
- `supabase/` — scripts do banco (rodar no SQL Editor do Supabase, em ordem)
