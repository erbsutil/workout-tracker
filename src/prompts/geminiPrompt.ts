export const geminiPrompt = (exerciseInput: string) => `
  Transforme a "entrada do usuário", que é um treino de academia, em um JSON válido para um gráfico de progressão de carga.

  Como requisito obrigatório a "entrada do usuário" deve conter:
  - Nome do exercício
  - Número de séries
  - Repetições por série
  - Pesos utilizados
  - Categoria do exercício

  ### Regras para interpretação da entrada:
  1. A entrada pode ter diferentes formatos, mas deve conter um nome de exercício seguido por séries, repetições e pesos.
  2. O modelo deve interpretar corretamente os seguintes formatos:

    - **Formato 1:** "Supino Inclinado 30°(H) 10x25 6x25"
      - Cada par "NxM" representa:
        - N = número de repetições
        - M = peso utilizado (em kg)
      - Exemplo:
        - "10x25 6x25" significa:
          - Série 1: 10 repetições, 25 kg
          - Série 2: 6 repetições, 25 kg

    - **Formato 2:** "Supino Inclinado 30°(H) 3x10x25"
      - "3x" representa o número de séries
      - "10x" representa o número de repetições por série
      - "25" representa o peso utilizado em todas as séries
      - Exemplo:
        - "3x10x25" significa:
          - Série 1: 10 repetições, 25 kg
          - Série 2: 10 repetições, 25 kg
          - Série 3: 10 repetições, 25 kg

  3. Caso a entrada tenha um formato diferente, mas contenha os dados necessários, interprete-os corretamente e extraia as informações.
  4. Se a entrada **não contiver dados suficientes** para gerar um JSON válido, retorne uma mensagem amigável indicando o que está faltando.

  ### Formato esperado da saída:
  Se a entrada for válida, retorne apenas um JSON no seguinte formato:

  {
    "exercise": "Nome do Exercício",
    "sets": [
      { "reps": número, "weight": número },
      { "reps": número, "weight": número }
    ],
    "category": "Categoria do Exercício"
  }

  Se a entrada for inválida, retorne um objeto com a chave "error" e uma mensagem de erro.
  {error: "Mensagem de erro"}

  IMPORTANTE:
  - Aceite variações de formato, desde que contenham os dados necessários.
  - Se os dados forem insuficientes, retorne uma mensagem amigável indicando o que está faltando.
  - Se os dados requisitos existirem: Retorne **apenas o JSON válido**, sem explicações.
  - Não envolva a saída em blocos de código (\`\`\`json ... \`\`\`).
  - em category a IA deve fornecer a categoria de acordo com o nome do exercício.
  Entrada do usuário:
  "${exerciseInput}"
`;
