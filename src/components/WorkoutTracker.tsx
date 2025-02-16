import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";

interface SetData {
  reps: number;
  weight: number;
}

interface ExerciseData {
  exercise: string;
  sets: SetData[];
}

type WorkoutLog = Record<string, ExerciseData[]>;

const fetchGeminiResponse = async (exerciseInput: string): Promise<ExerciseData> => {
  const prompt = `
    Transforme a "entrada do usuário", que é um treino de academia, em um JSON válido para um gráfico de progressão de carga.

    Como requisito obrigatório a "entrada do usuário" deve conter:
    - Nome do exercício
    - Número de séries
    - Repetições por série
    - Pesos utilizados

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
    4. Se a entrada **não contiver dados suficientes** para gerar um JSON válido, retorne o seguinte formato de erro:

    {
      "error": "Formato inválido. A entrada deve conter um nome de exercício seguido por séries, repetições e pesos."
    }

    ### Formato esperado da saída:
    Se a entrada for válida, retorne apenas um JSON no seguinte formato:

    {
      "exercise": "Nome do Exercício",
      "sets": [
        { "reps": número, "weight": número },
        { "reps": número, "weight": número }
      ]
    }

    IMPORTANTE:
    - Aceite variações de formato, desde que contenham os dados necessários.
    - Se os dados forem insuficientes, retorne o JSON de erro.
    - Se os dados requisitos existirem: Retorne **apenas o JSON válido**, sem explicações.
    - Não envolva a saída em blocos de código (\`\`\`json ... \`\`\`).

    Entrada do usuário:
    "${exerciseInput}"
    `;

  const res = await fetch(
    `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${process.env.PUBLIC_GEMINI_API_KEY}`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ contents: [{ parts: [{ text: prompt }] }] }),
    }
  );

  const data = await res.json();
  const rawContent = data.candidates?.[0]?.content.parts[0].text.replace(/```json|```/g, "").trim();
  return JSON.parse(rawContent);
};

const ExerciseInput = ({ value, onChange, onAdd, loading }: { value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; onAdd: () => void; loading: boolean }) => (
  <div>
    <input
      type="text"
      value={value}
      onChange={onChange}
      className="w-full p-2 border rounded"
      placeholder="Digite o exercício, séries, repetições e peso..."
    />
    <button onClick={onAdd} disabled={loading} className="w-full bg-blue-500 text-white p-2 rounded mt-2">
      {loading ? "Processando..." : "Adicionar Exercício"}
    </button>
  </div>
);

const ExerciseSelect = ({ exercises, onSelect }: { exercises: string[]; onSelect: (e: ChangeEvent<HTMLSelectElement>) => void }) => (
  <select className="w-full p-2 border rounded mb-4" onChange={onSelect}>
    <option value="">Selecione um exercício</option>
    {[...new Set(exercises)].map((exercise, i) => (
      <option key={i} value={exercise}>{exercise}</option>
    ))}
  </select>
);

const ExerciseChart = ({ data }: { data: { day: string; totalVolume: number; averageLoad: number; maxLoad: number }[] }) => (
  <div className="bg-white p-4 rounded-md">
    <LineChart width={400} height={250} data={data}>
      <XAxis dataKey="day" />
      <YAxis />
      <Tooltip />
      <CartesianGrid stroke="#ccc" />
      <Line type="monotone" dataKey="totalVolume" stroke="#ff7300" name="Carga Total" />
      <Line type="monotone" dataKey="averageLoad" stroke="#387908" name="Peso Médio" />
      <Line type="monotone" dataKey="maxLoad" stroke="#8884d8" name="Maior Carga" />
    </LineChart>
  </div>
);

export default function WorkoutTracker() {
  const [exerciseInput, setExerciseInput] = useState<string>("");
  const [workoutData, setWorkoutData] = useState<WorkoutLog>({});
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [geminiResponse, setGeminiResponse] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);

  const inputRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const storedData = localStorage.getItem("workoutLogs");
    if (storedData) setWorkoutData(JSON.parse(storedData) as WorkoutLog);
  }, []);

  const addExercise = async () => {
    if (!exerciseInput.trim()) return;

    setLoading(true);
    try {
      const formattedExercise = await fetchGeminiResponse(exerciseInput);

      if (!formattedExercise.exercise || !formattedExercise.sets) throw new Error("Resposta inválida do Gemini");

      setWorkoutData((prev) => {
        const updatedExercises = [...(prev[today] || [])];
        const existingExerciseIndex = updatedExercises.findIndex((ex) => ex.exercise === formattedExercise.exercise);

        if (existingExerciseIndex !== -1) {
          updatedExercises[existingExerciseIndex].sets.push(...formattedExercise.sets);
        } else {
          updatedExercises.push(formattedExercise);
        }

        const updatedData = { ...prev, [today]: updatedExercises };
        localStorage.setItem("workoutLogs", JSON.stringify(updatedData));
        return updatedData;
      });

      setGeminiResponse("Treino registrado com sucesso!");
    } catch (error) {
      console.error("Erro ao conectar com a API Gemini:", error);
      setGeminiResponse("Erro ao interpretar os dados. Verifique o formato e tente novamente.");
    } finally {
      setLoading(false);
    }
  };

  const chartData = Object.entries(workoutData)
    .filter(([_, exercises]) => exercises.some((ex) => ex.exercise === selectedExercise))
    .map(([date, exercises]) => {
      const exerciseData = exercises.filter((ex) => ex.exercise === selectedExercise);
      let totalVolume = 0, totalReps = 0, maxLoad = 0;

      exerciseData.forEach((ex) => {
        ex.sets.forEach((set) => {
          totalVolume += set.reps * set.weight;
          totalReps += set.reps;
          if (set.weight > maxLoad) maxLoad = set.weight;
        });
      });

      const averageLoad = totalReps > 0 ? totalVolume / totalReps : 0;
      return { day: date, totalVolume, averageLoad, maxLoad };
    });

  return (
    <div className="p-4 bg-gray-100 rounded-md shadow-md max-w-xl mx-auto">
      <h2 className="text-center text-xl font-bold mb-4">Registro de Treino</h2>
      <ExerciseInput
        value={exerciseInput}
        onChange={(e) => setExerciseInput(e.target.value)}
        onAdd={addExercise}
        loading={loading}
      />
      {geminiResponse && <p className="mt-4 text-gray-700">{geminiResponse}</p>}
      <h3 className="text-center text-lg font-bold mt-6">Progresso</h3>
      <ExerciseSelect
        exercises={Object.values(workoutData).flat().map((ex) => ex.exercise)}
        onSelect={(e) => setSelectedExercise(e.target.value)}
      />
      {selectedExercise && chartData.length > 0 && <ExerciseChart data={chartData} />}
    </div>
  );
}
