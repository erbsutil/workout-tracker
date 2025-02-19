import { useState, useEffect, useRef, type ChangeEvent } from "react";
import { LineChart, Line, XAxis, YAxis, Tooltip, CartesianGrid } from "recharts";
import { exercises as predefinedExercises } from "../data/exercises"; // Importar exercícios predefinidos
import { db, signInAnonymouslyToFirebase } from "../firebaseConfig";
import { collection, addDoc, getDocs, query, where, doc, updateDoc, deleteDoc, getDoc } from "firebase/firestore";
import { onAuthStateChanged } from "firebase/auth";
import { geminiPrompt } from "../prompts/geminiPrompt"; // Import the prompt

interface SetData {
  reps: number;
  weight: number;
  timestamp: string; // Adicionar campo de data e hora
}

interface ExerciseData {
  exercise: string;
  sets: SetData[];
  category: string;
  date: string;
  docId?: string;
}

type WorkoutLog = Record<string, ExerciseData[]>;

const normalizeExerciseName = (name: string) => name.toLowerCase();

const fetchGeminiResponse = async (exerciseInput: string): Promise<ExerciseData | { error: string }> => {
  const prompt = geminiPrompt(exerciseInput);

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

const ExerciseChart = ({ data }: { data: { day: string; averageLoad: number; maxLoad: number; totalVolume: number }[] }) => (
  <div className="bg-white p-4 rounded-md">
    <LineChart width={400} height={250} data={data}>
      <XAxis dataKey="day" />
      <YAxis />
      <Tooltip />
      <CartesianGrid stroke="#ccc" />
      <Line type="monotone" dataKey="averageLoad" stroke="#387908" name="Peso Médio" />
      <Line type="monotone" dataKey="maxLoad" stroke="#8884d8" name="Maior Carga" />
      <Line type="monotone" dataKey="totalVolume" stroke="#ff7300" name="Volume Total" />
    </LineChart>
  </div>
);

const LastSets = ({ workoutData, setWorkoutData, userId }: { 
  workoutData: WorkoutLog; 
  setWorkoutData: React.Dispatch<React.SetStateAction<WorkoutLog>>; 
  userId: string | null 
}) => {
  const [lastSets, setLastSets] = useState<{ date: string; exercise: string; set: SetData; docId: string }[]>([]);

  useEffect(() => {
    const updateLastSets = () => {
      const sets: { date: string; exercise: string; set: SetData; docId: string }[] = [];
      Object.values(workoutData).forEach(exercises => {
        exercises.forEach(exercise => {
          exercise.sets.forEach(set => {
            sets.push({ date: exercise.date, exercise: exercise.exercise, set, docId: exercise.docId });
          });
        });
      });

      // Ordenar sets por timestamp em ordem decrescente
      sets.sort((a, b) => new Date(b.set.timestamp).getTime() - new Date(a.set.timestamp).getTime());

      setLastSets(sets.slice(0, 3)); // Garantir que apenas os últimos 3 sets únicos sejam exibidos
    };

    updateLastSets();
  }, [workoutData]);

  const deleteSet = async (docId: string, timestamp: string) => {
    if (!userId) return;
  
    const userDocRef = doc(db, "users", userId);
    const workoutDocRef = doc(userDocRef, "workouts", docId);
    const workoutDoc = await getDoc(workoutDocRef);
  
    if (!workoutDoc.exists()) return;
  
    const workoutData = workoutDoc.data() as ExerciseData;
  
    // **Remove APENAS um set, mesmo que existam múltiplos com o mesmo timestamp**
    let removed = false;
    const updatedSets = workoutData.sets.filter(set => {
      if (!removed && set.timestamp === timestamp) {
        removed = true; // Apenas UM set será removido
        return false;
      }
      return true;
    });
  
    if (updatedSets.length > 0) {
      await updateDoc(workoutDocRef, { sets: updatedSets });
    } else {
      await deleteDoc(workoutDocRef);
    }
  
    // **Atualiza workoutData para refletir a remoção do set correto**
    setWorkoutData(prev => {
      const updatedWorkoutData = { ...prev };
  
      if (updatedWorkoutData[workoutData.date]) {
        updatedWorkoutData[workoutData.date] = updatedWorkoutData[workoutData.date]
          .map(exercise => {
            if (exercise.docId === docId) {
              return { ...exercise, sets: updatedSets };
            }
            return exercise;
          })
          .filter(exercise => exercise.sets.length > 0); // Remove exercícios sem sets
      }
  
      return updatedWorkoutData;
    });
  
    // **Atualiza lastSets para remover apenas UM set**
    setLastSets(prev => {
      let found = false;
      return prev.filter(set => {
        if (!found && set.docId === docId && set.set.timestamp === timestamp) {
          found = true; // Apenas o primeiro encontrado será removido
          return false;
        }
        return true;
      });
    });
  };

  return (
    <div className="mt-4">
      <h3 className="text-center text-lg font-bold">Últimos 3 Sets</h3>
      {lastSets.map((item, index) => (
        <div key={index} className="flex justify-between items-center bg-gray-200 p-2 rounded mb-2">
          <div>
            <p>{item.date} - {item.exercise}</p>
            <p>Reps: {item.set.reps}, Peso: {item.set.weight} kg</p>
            <p>Adicionado em: {new Date(item.set.timestamp).toLocaleString()}</p>
          </div>
          <button
            onClick={() => deleteSet(item.docId, item.set.timestamp)}
            className="bg-red-500 text-white p-1 rounded"
          >
            Deletar
          </button>
        </div>
      ))}
    </div>
  );
};

export default function WorkoutTracker() {
  const [exerciseInput, setExerciseInput] = useState<string>("");
  const [workoutData, setWorkoutData] = useState<WorkoutLog>({});
  const [selectedExercise, setSelectedExercise] = useState<string>("");
  const [geminiResponse, setGeminiResponse] = useState<string>("");
  const [loading, setLoading] = useState<boolean>(false);
  const [userId, setUserId] = useState<string | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);
  const today = new Date().toLocaleDateString('en-CA'); // Ajuste para considerar o fuso horário local

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
        data[date].push({ ...docData, docId: doc.id });
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
        const timestamp = new Date().toISOString(); // Obter data e hora atual

        // Adicionar timestamp a cada set
        formattedExercise.sets = formattedExercise.sets.map((set) => ({
          ...set,
          timestamp: new Date().toISOString() // Adiciona o timestamp
        }));

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
          const docRef = await addDoc(workoutCollectionRef, {
            date: today,
            ...formattedExercise
          });

          setWorkoutData((prev) => {
            const updatedExercises = [...(prev[today] || []), { ...formattedExercise, docId: docRef.id }];
            const updatedData = { ...prev, [today]: updatedExercises };
            return updatedData;
          });
        }

        // Atualizar os últimos 3 sets após adicionar um novo exercício
        const qLastSets = query(collection(db, "users", userId, "workouts"));
        const querySnapshotLastSets = await getDocs(qLastSets);
        const dataLastSets: WorkoutLog = {};
        querySnapshotLastSets.forEach((doc) => {
          const docData = doc.data() as ExerciseData;
          const date = docData.date;
          if (!dataLastSets[date]) {
            dataLastSets[date] = [];
          }
          dataLastSets[date].push({ ...docData, docId: doc.id });
        });
        setWorkoutData(dataLastSets);

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
    return { day: date, averageLoad, maxLoad, totalVolume };
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
    <LastSets workoutData={workoutData} setWorkoutData={setWorkoutData} userId={userId} />
  </div>
  );
}