# Leitor E-Card USP

Aplicativo web (PWA) que lê o código de barras do e-Card da USP com a câmera do celular ou tablet e registra o número USP em uma lista por evento, exportável em planilha `.xlsx`. Roda inteiro no aparelho: não há servidor, conta nem banco de dados.

Hospedagem: GitHub Pages, repositório `SrArtur2000/appbarcode.github.io`. Cada versão fica em uma pasta própria (`v2/` … `v9/`) e a raiz guarda a primeira versão, sem service worker.

## Por que uma pasta por versão

O service worker guarda os arquivos no aparelho, e o navegador também mantém o `sw.js` em cache por um tempo. Alterar uma versão já publicada pode não chegar a quem já abriu o app. Por isso cada mudança vai para uma pasta nova, com endereço novo e cache próprio (`ecard<N>-1`). **Não edite uma versão já publicada.**

| Versão | Mudança |
|---|---|
| v2 | Endereço novo, sem cache antigo; raiz sem service worker |
| v3 | Cópia de v2 |
| v4 | Cada leitura é confirmada (Usar / Descartar) antes de entrar na lista |
| v5 | Lista de eventos salvos, com troca por toque |
| v6 | Câmera menor, lista de registros rolável, botões de baixar e apagar lado a lado |
| v7 | Layout de duas colunas para tablet (a partir de 700 × 480 px) |
| v8 | "Apagar este evento" remove também o nome do evento da lista de salvos |
| v9 | O nome da planilha ganha um código de 6 caracteres único de cada aparelho (`..._HHMM_K7M2QX.xlsx`), para dois celulares não gerarem arquivos com o mesmo nome |

## Como funciona a leitura

1. `getUserMedia` abre a câmera traseira (`facingMode: environment`, ideal 1280 × 720).
2. Dois leitores são possíveis, nesta ordem:
   - **`BarcodeDetector` nativo** (Chrome/Android), se o navegador suportar o formato ITF. Consulta o quadro de vídeo a cada 80 ms, sem sobrepor chamadas.
   - **ZXing** (`lib/zxing.min.js`), como alternativa, com intervalo de 100 ms.
3. Formatos aceitos: **ITF, Code 128 e Code 39**. O e-Card usa esses; outros códigos (por exemplo EAN-13 de produtos) são ignorados.
4. O texto lido passa por `soNumero`: mantém só os dígitos e remove zeros à esquerda. O resultado é o número USP.
5. Leituras iguais em menos de 3 s (`ESPERA_MS`) são ignoradas, para o leitor rápido não repetir.

### Confirmação (v4 em diante)

A leitura é rápida, mas por ângulo e iluminação pode sair errada. Por isso o app não grava direto:

- Ao detectar um número, ele entra em estado **pendente**, e novas leituras são ignoradas enquanto ele estiver na tela.
- O usuário toca em **✓ Usar** (grava, com bip e vibração) ou **✕ Descartar** (não grava).
- Se o número já existe no evento, o app avisa "Já estava registrado" sem pedir confirmação.
- Trocar ou apagar o evento descarta uma leitura pendente.
- O campo de digitação manual grava direto, sem confirmação.

## Dados e privacidade

- **Onde ficam:** em `localStorage`, na chave `ecard.dados.v2`, no navegador do aparelho. Estrutura: `{evento, eventos: {nome: [{numero, hora}]}}`.
- **Nenhum dado sai do aparelho.** O `app.js` não faz chamadas de rede (sem `fetch`, `XMLHttpRequest`, `WebSocket` ou `sendBeacon`) e não contém endereços externos. O servidor (GitHub Pages) só entrega os arquivos do app.
- **Service worker (`sw.js`):** só busca e guarda os arquivos do próprio app. Páginas e código usam rede primeiro (para pegar a versão nova), com o cache como reserva; as bibliotecas em `lib/` usam o cache primeiro.
- **Câmera:** o vídeo é processado no aparelho; nenhuma imagem é salva nem enviada.
- **Planilha:** o `.xlsx` é gerado no navegador (SheetJS, `lib/xlsx.full.min.js`) e baixado para o aparelho. Colunas: `Evento`, `Nº USP` (gravado como texto, para o Excel não alterar o número), `Data/hora`. Nome do arquivo (v9): `presenca_<evento>_<AAAA-MM-DD>_<HHMM>_<código do aparelho>.xlsx`. O código (6 letras/números, sem 0/O/1/I) é sorteado na primeira abertura, fica guardado no aparelho (`localStorage`, chave `ecard.aparelho`) e aparece ao lado do título do app. Limpar os dados do navegador gera um código novo.

### Limites a ter em mente

- Não há senha nem criptografia local: quem usar o aparelho desbloqueado, com o mesmo navegador, vê os registros.
- O `localStorage` é separado por **origem** (domínio), não por pasta. As versões publicadas no mesmo domínio e com a mesma chave (`ecard.dados.v2`) enxergam os mesmos eventos, e duas abas abertas em versões diferentes podem sobrescrever os dados uma da outra.
- Limpar os dados do navegador apaga os registros. Baixe a planilha ao fim de cada evento.
- As bibliotecas em `lib/` são arquivos minificados de terceiros (ZXing e SheetJS). Não foram auditadas.
- O repositório pode ser público; isso expõe o código, não as leituras.

## Eventos

- Cada evento tem sua própria lista, e o número USP não se repete dentro do evento.
- **Eventos salvos:** a seção recolhível mostra todos os eventos com a contagem de registros. Tocar em um deles o abre. Digitar um nome novo no campo "Evento" cria o evento.
- **Apagar este evento:** exige dois toques (o segundo em até 4 s). Remove o evento e seus registros e abre o último evento restante, ou um "Evento 1" vazio se não sobrar nenhum.

## Arquivos de cada versão

| Arquivo | Função |
|---|---|
| `index.html` | Interface e estilos (layout de celular e de tablet) |
| `app.js` | Leitura, confirmação, eventos, armazenamento e exportação |
| `sw.js` | Cache para uso sem internet; o nome do cache muda a cada versão |
| `manifest.webmanifest`, `icone-*.png` | Instalação como app |
| `lib/` | ZXing e SheetJS |

## Criar uma nova versão

1. Copie a pasta da última versão: `cp -r v9 v10`.
2. Em `v10/sw.js`, troque o prefixo do cache (`ecard9` → `ecard10`, em todas as ocorrências).
3. Faça as mudanças só em `v10/`.
4. Commit e push para a `main`; o GitHub Pages publica em `/v10/`.
