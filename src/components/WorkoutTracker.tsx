import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { exercises as predefinedExercises } from "../data/exercises"; // Importar exercícios predefinidos
import { db, signInAnonymouslyToFirebase } from "../firebaseConfig";
import { collection, addDoc, getDocs, query, where, doc, updateDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";

interface SetData {
  reps: number;
  weight: number;
}

interface ExerciseData {
  exercise: string;
  sets: SetData[];
  category: string;
}

type WorkoutLog = Record<string, ExerciseData[]>;

const normalizeExerciseName = (name: string) => name.toLowerCase();

const fetchGeminiResponse = async (exerciseInput: string): Promise<ExerciseData | { error: string }> => {
  const prompt = `
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

  const res = await fetch(
    `/api/gemini`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ prompt }),
    }
  );

  const data = await res.json();
  return data;
};

const ExerciseInput = ({ value, onChange, onAdd, loading, suggestions }: { value: string; onChange: (e: ChangeEvent<HTMLInputElement>) => void; onAdd: () => void; loading: boolean; suggestions: string[] }) => {
  const [showSuggestions, setShowSuggestions] = useState(false);
  const [filteredSuggestions, setFilteredSuggestions] = useState<string[]>([]);
  const [placeholder, setPlaceholder] = useState<string>("Digite o exercício, séries, repetições e peso...");
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (value.length >= 3) {
      const filtered = suggestions
        .filter((suggestion) =>
          suggestion.toLowerCase().includes(value.toLowerCase())
        )
        .sort()
        .slice(0, 3);
      setFilteredSuggestions(filtered);
      setShowSuggestions(filtered.length > 1 || (filtered.length === 1 && filtered[0].toLowerCase() !== value.toLowerCase()));
    } else {
      setShowSuggestions(false);
    }
  }, [value, suggestions]);

  const handleSuggestionClick = (suggestion: string) => {
    onChange({ target: { value: suggestion + " " } } as ChangeEvent<HTMLInputElement>);
    setShowSuggestions(false);
    setFilteredSuggestions([]);
    setPlaceholder("Agora, preencha as séries, repetições e peso...");
    inputRef.current?.focus();
  };

  const handleChange = (e: ChangeEvent<HTMLInputElement>) => {
    onChange(e);
    const inputValue = e.target.value;
    const filtered = suggestions
      .filter((suggestion) =>
        suggestion.toLowerCase().includes(inputValue.toLowerCase())
      )
      .sort()
      .slice(0, 3);
    setFilteredSuggestions(filtered);
    setShowSuggestions(inputValue.length >= 3 && (filtered.length > 1 || (filtered.length === 1 && filtered[0].toLowerCase() !== inputValue.toLowerCase())));
  };

  return (
    <div>
      <input
        type="text"
        value={value}
        onChange={handleChange}
        className="w-full p-2 border rounded"
        placeholder={placeholder}
        ref={inputRef}
      />
      {showSuggestions && filteredSuggestions.length > 0 && (
        <div className="mt-2">
          {filteredSuggestions.map((suggestion, index) => (
            <button
              key={index}
              className="w-full p-2 mb-2 bg-gray-200 rounded text-left capitalize"
              onClick={() => handleSuggestionClick(suggestion)}
            >
              {suggestion}
            </button>
          ))}
        </div>
      )}
      <p className="text-gray-500 mt-2">{placeholder}</p>
      <button onClick={onAdd} disabled={loading} className="w-full bg-blue-500 text-white p-2 rounded mt-2">
        {loading ? "Processando..." : "Adicionar Exercício"}
      </button>
    </div>
  );
};

const ExerciseSelect = ({ exercises, onSelect }: { exercises: string[]; onSelect: (e: ChangeEvent<HTMLSelectElement>) => void }) => (
  <select className="w-full p-2 border rounded mb-4" onChange={onSelect}>
    <option value="">Selecione um exercício</option>
    {[...new Set(exercises)].map((exercise, i) => (
      <option key={i} value={exercise}>{exercise}</option>
    ))}
  </select>
);

const ExerciseChart = ({ data }: { data: { day: string; averageLoad: number; maxLoad: number }[] }) => (
  <div className="bg-white p-4 rounded-md">
    <LineChart width={400} height={250} data={data}>
      <XAxis dataKey="day" />
      <YAxis />
      <Tooltip />
      <CartesianGrid stroke="#ccc" />
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
  const [userId, setUserId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const today = new Date().toISOString().split("T")[0];

  useEffect(() => {
    const fetchWorkoutData = async (userId: string) => {
      const q = query(collection(db, "users", userId, "workouts"));
      const querySnapshot = await getDocs(q);
      const data: WorkoutLog = {};
      querySnapshot.forEach((doc) => {
        const docData = doc.data() as ExerciseData;
        const date = docData.date;
        if (!data[date]) {
          data[date] = [];
        }
        data[date].push(docData);
      });
      setWorkoutData(data);
    };

    const authenticateUser = async () => {
      const user = await signInAnonymouslyToFirebase();
      if (user) {
        setUserId(user.uid);
        fetchWorkoutData(user.uid);
      }
    };

    authenticateUser();
  }, []);

  const addExercise = async () => {
    if (!exerciseInput.trim() || !userId) return;

    setLoading(true);
    try {
      const response = await fetchGeminiResponse(exerciseInput);

      if ('error' in response) {
        setGeminiResponse(response.error);
      } else {
        const formattedExercise = response;

        const userDocRef = doc(db, "users", userId);
        const workoutCollectionRef = collection(userDocRef, "workouts");

        const q = query(workoutCollectionRef, where("date", "==", today), where("exercise", "==", formattedExercise.exercise));
        const querySnapshot = await getDocs(q);

        if (!querySnapshot.empty) {
          // Se o exercício já existe, atualize-o com as novas séries
          const existingDoc = querySnapshot.docs[0];
          const existingData = existingDoc.data() as ExerciseData;
          const updatedSets = [...existingData.sets, ...formattedExercise.sets];

          await updateDoc(existingDoc.ref, { sets: updatedSets });

          setWorkoutData((prev) => {
            const updatedExercises = [...(prev[today] || [])];
            const existingExerciseIndex = updatedExercises.findIndex(
              (ex) => normalizeExerciseName(ex.exercise) === normalizeExerciseName(formattedExercise.exercise)
            );

            if (existingExerciseIndex !== -1) {
              updatedExercises[existingExerciseIndex].sets = updatedSets;
            }

            const updatedData = { ...prev, [today]: updatedExercises };
            return updatedData;
          });
        } else {
          // Se o exercício não existe, adicione-o
          await addDoc(workoutCollectionRef, {
            date: today,
            ...formattedExercise
          });

          setWorkoutData((prev) => {
            const updatedExercises = [...(prev[today] || []), formattedExercise];
            const updatedData = { ...prev, [today]: updatedExercises };
            return updatedData;
          });
        }

        setGeminiResponse("Treino registrado com sucesso!");
      }
    } catch (error) {
      console.error("Erro ao conectar com a API Gemini:", error);
      setGeminiResponse(`Erro ao interpretar os dados: ${error.message}`);
    } finally {
      setLoading(false);
    }
  };

  const chartData = Object.entries(workoutData)
  .filter(([_, exercises]) => exercises.some((ex) => normalizeExerciseName(ex.exercise) === normalizeExerciseName(selectedExercise)))
  .map(([date, exercises]) => {
    const exerciseData = exercises.filter((ex) => normalizeExerciseName(ex.exercise) === normalizeExerciseName(selectedExercise));
    let totalVolume = 0, totalReps = 0, maxLoad = 0;

    exerciseData.forEach((ex) => {
      ex.sets.forEach((set) => {
        totalVolume += set.reps * set.weight;
        totalReps += set.reps;
        if (set.weight > maxLoad) maxLoad = set.weight;
      });
    });

    const averageLoad = totalReps > 0 ? totalVolume / totalReps : 0;
    return { day: date, averageLoad, maxLoad };
  });

  const exerciseSuggestions = [
    ...new Set([
      ...Object.values(workoutData).flat().map((ex) => normalizeExerciseName(ex.exercise)),
      ...predefinedExercises.flatMap((group) => group.exercises.map(normalizeExerciseName))
    ])
  ];

  return (
    <div className="p-4 bg-gray-100 rounded-md shadow-md max-w-xl mx-auto">
    <h2 className="text-center text-xl font-bold mb-4">Registro de Treino</h2>
    <ExerciseInput
      value={exerciseInput}
      onChange={(e) => setExerciseInput(e.target.value)}
      onAdd={addExercise}
      loading={loading}
      suggestions={exerciseSuggestions}
    />
    {geminiResponse && <p className="mt-4 text-gray-700">{geminiResponse}</p>}
    <h3 className="text-center text-lg font-bold mt-6">Progresso</h3>
    <ExerciseSelect
      exercises={Object.values(workoutData).flat().map((ex) => normalizeExerciseName(ex.exercise))}
      onSelect={(e) => setSelectedExercise(e.target.value)}
    />
    {selectedExercise && chartData.length > 0 && <ExerciseChart data={chartData} />}
  </div>
  );
}