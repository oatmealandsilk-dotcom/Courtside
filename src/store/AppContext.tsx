import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';

import { fetchBootstrap, signIn as apiSignIn, type Bootstrap } from '@/data/api';
import { connectProvider, disconnectProvider } from '@/lib/integrations';
import type {
  Answer,
  Coach,
  CoachingRequest,
  Comment,
  ID,
  Integration,
  MatchResult,
  Post,
  PostKind,
  Question,
  QuestionTopic,
  SessionDetail,
  User,
  PlayerProfile,
} from '@/data/types';

interface NewPostInput {
  kind: PostKind;
  body: string;
  location?: string;
  tags: string[];
  match?: MatchResult;
  session?: SessionDetail;
  mediaLabel?: string;
  videoUrl?: string;
}

interface NewQuestionInput {
  title: string;
  body: string;
  topic: QuestionTopic;
  tags: string[];
}

interface AppState extends Bootstrap {
  ready: boolean;
  currentUserId: ID | null;
  onboardingComplete: boolean;
  error: string | null;
}

interface AppActions {
  signIn: (handle: string) => Promise<void>;
  signOut: () => void;
  completeOnboarding: (profile: PlayerProfile) => void;
  updateIdentity: (patch: Pick<User, 'name' | 'bio' | 'location'>) => void;
  updateProfile: (patch: Partial<PlayerProfile>) => void;

  toggleLike: (postId: ID) => void;
  addPost: (input: NewPostInput) => ID;
  addComment: (postId: ID, body: string) => void;

  addQuestion: (input: NewQuestionInput) => ID;
  voteQuestion: (questionId: ID, direction: 1 | -1) => void;
  addAnswer: (questionId: ID, body: string) => void;
  voteAnswer: (answerId: ID, direction: 1 | -1) => void;

  submitCoachingRequest: (coachId: ID, serviceId: ID, question: string, videoLabel?: string) => ID;
  toggleIntegration: (provider: Integration['provider']) => Promise<void>;
}

interface AppContextValue extends AppState {
  currentUser: User | null;
  actions: AppActions;
}

const AppContext = createContext<AppContextValue | null>(null);

const emptyBootstrap: Bootstrap = {
  users: [],
  posts: [],
  comments: [],
  questions: [],
  answers: [],
  coaches: [],
  coachingRequests: [],
  integrations: [],
  healthHistory: [],
  achievements: [],
};

let idCounter = 0;
const nextId = (prefix: string): string => {
  idCounter += 1;
  return `${prefix}-${Date.now().toString(36)}-${idCounter}`;
};

export function AppProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AppState>({
    ...emptyBootstrap,
    ready: false,
    currentUserId: null,
    onboardingComplete: false,
    error: null,
  });

  useEffect(() => {
    let cancelled = false;
    fetchBootstrap()
      .then((data) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, ...data, ready: true }));
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        setState((prev) => ({
          ...prev,
          ready: true,
          error: err instanceof Error ? err.message : 'Something went wrong loading CourtSide.',
        }));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const currentUser = useMemo(
    () => state.users.find((u) => u.id === state.currentUserId) ?? null,
    [state.users, state.currentUserId],
  );

  const requireUser = useCallback((): ID => {
    if (!state.currentUserId) throw new Error('Not signed in');
    return state.currentUserId;
  }, [state.currentUserId]);

  const signIn = useCallback(async (handle: string) => {
    const user = await apiSignIn(handle);
    setState((prev) => ({
      ...prev,
      currentUserId: user.id,
      // The demo account arrives with a filled-in profile; treat that as onboarded.
      onboardingComplete: user.profile.goals.length > 0,
      error: null,
    }));
  }, []);

  const signOut = useCallback(() => {
    setState((prev) => ({ ...prev, currentUserId: null, onboardingComplete: false }));
  }, []);

  const patchCurrentUser = useCallback(
    (updater: (user: User) => User) => {
      setState((prev) => ({
        ...prev,
        users: prev.users.map((u) => (u.id === prev.currentUserId ? updater(u) : u)),
      }));
    },
    [],
  );

  const completeOnboarding = useCallback(
    (profile: PlayerProfile) => {
      patchCurrentUser((u) => ({ ...u, profile }));
      setState((prev) => ({ ...prev, onboardingComplete: true }));
    },
    [patchCurrentUser],
  );

  const updateIdentity = useCallback((patch: Pick<User, 'name' | 'bio' | 'location'>) => { patchCurrentUser(u => ({ ...u, ...patch })); }, [patchCurrentUser]);

  const updateProfile = useCallback(
    (patch: Partial<PlayerProfile>) => {
      patchCurrentUser((u) => ({ ...u, profile: { ...u.profile, ...patch } }));
    },
    [patchCurrentUser],
  );

  const toggleLike = useCallback(
    (postId: ID) => {
      const me = requireUser();
      setState((prev) => ({
        ...prev,
        posts: prev.posts.map((p) =>
          p.id === postId
            ? {
                ...p,
                likedBy: p.likedBy.includes(me)
                  ? p.likedBy.filter((id) => id !== me)
                  : [...p.likedBy, me],
              }
            : p,
        ),
      }));
    },
    [requireUser],
  );

  const addPost = useCallback(
    (input: NewPostInput): ID => {
      const me = requireUser();
      const post: Post = {
        id: nextId('p'),
        authorId: me,
        createdAt: new Date().toISOString(),
        likedBy: [],
        commentIds: [],
        ...input,
      };
      setState((prev) => ({ ...prev, posts: [post, ...prev.posts] }));
      return post.id;
    },
    [requireUser],
  );

  const addComment = useCallback(
    (postId: ID, body: string) => {
      const me = requireUser();
      const comment: Comment = {
        id: nextId('c'),
        postId,
        authorId: me,
        body,
        createdAt: new Date().toISOString(),
        likedBy: [],
      };
      setState((prev) => ({
        ...prev,
        comments: [...prev.comments, comment],
        posts: prev.posts.map((p) =>
          p.id === postId ? { ...p, commentIds: [...p.commentIds, comment.id] } : p,
        ),
      }));
    },
    [requireUser],
  );

  const addQuestion = useCallback(
    (input: NewQuestionInput): ID => {
      const me = requireUser();
      const question: Question = {
        id: nextId('q'),
        authorId: me,
        createdAt: new Date().toISOString(),
        votes: 0,
        votedBy: {},
        answerIds: [],
        ...input,
      };
      setState((prev) => ({ ...prev, questions: [question, ...prev.questions] }));
      return question.id;
    },
    [requireUser],
  );

  const voteQuestion = useCallback(
    (questionId: ID, direction: 1 | -1) => {
      const me = requireUser();
      setState((prev) => ({
        ...prev,
        questions: prev.questions.map((q) => (q.id === questionId ? applyVote(q, me, direction) : q)),
      }));
    },
    [requireUser],
  );

  const voteAnswer = useCallback(
    (answerId: ID, direction: 1 | -1) => {
      const me = requireUser();
      setState((prev) => ({
        ...prev,
        answers: prev.answers.map((a) => (a.id === answerId ? applyVote(a, me, direction) : a)),
      }));
    },
    [requireUser],
  );

  const addAnswer = useCallback(
    (questionId: ID, body: string) => {
      const me = requireUser();
      setState((prev) => {
        const author = prev.users.find((u) => u.id === me);
        const answer: Answer = {
          id: nextId('a'),
          questionId,
          authorId: me,
          body,
          createdAt: new Date().toISOString(),
          votes: 0,
          votedBy: {},
          fromCoach: Boolean(author?.isCoach),
        };
        return {
          ...prev,
          answers: [...prev.answers, answer],
          questions: prev.questions.map((q) =>
            q.id === questionId ? { ...q, answerIds: [...q.answerIds, answer.id] } : q,
          ),
        };
      });
    },
    [requireUser],
  );

  const submitCoachingRequest = useCallback(
    (coachId: ID, serviceId: ID, question: string, videoLabel?: string): ID => {
      const me = requireUser();
      const request: CoachingRequest = {
        id: nextId('cr'),
        coachId,
        userId: me,
        serviceId,
        question,
        videoLabel,
        status: 'submitted',
        createdAt: new Date().toISOString(),
      };
      setState((prev) => ({ ...prev, coachingRequests: [request, ...prev.coachingRequests] }));
      return request.id;
    },
    [requireUser],
  );

  // Keep a ref so async actions read fresh state without re-creating callbacks.
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const toggleIntegration = useCallback(async (provider: Integration['provider']) => {
    const current = stateRef.current.integrations.find((i) => i.provider === provider);
    if (!current) return;
    const updated = current.connected
      ? await disconnectProvider(current)
      : await connectProvider(current);
    setState((prev) => ({
      ...prev,
      integrations: prev.integrations.map((i) => (i.provider === provider ? updated : i)),
    }));
  }, []);

  const actions = useMemo<AppActions>(
    () => ({
      signIn,
      signOut,
      completeOnboarding,
      updateProfile,
      updateIdentity,
      toggleLike,
      addPost,
      addComment,
      addQuestion,
      voteQuestion,
      addAnswer,
      voteAnswer,
      submitCoachingRequest,
      toggleIntegration,
    }),
    [
      signIn,
      signOut,
      completeOnboarding,
      updateProfile,
      updateIdentity,
      toggleLike,
      addPost,
      addComment,
      addQuestion,
      voteQuestion,
      addAnswer,
      voteAnswer,
      submitCoachingRequest,
      toggleIntegration,
    ],
  );

  const value = useMemo<AppContextValue>(
    () => ({ ...state, currentUser, actions }),
    [state, currentUser, actions],
  );

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
}

function applyVote<T extends { votes: number; votedBy: Record<ID, 1 | -1> }>(
  item: T,
  userId: ID,
  direction: 1 | -1,
): T {
  const existing = item.votedBy[userId];
  const votedBy: Record<ID, 1 | -1> = { ...item.votedBy };
  let delta = 0;

  if (existing === direction) {
    delete votedBy[userId];
    delta = -direction;
  } else if (existing) {
    votedBy[userId] = direction;
    delta = 2 * direction;
  } else {
    votedBy[userId] = direction;
    delta = direction;
  }

  return { ...item, votes: item.votes + delta, votedBy };
}

export function useApp(): AppContextValue {
  const ctx = useContext(AppContext);
  if (!ctx) throw new Error('useApp must be used inside <AppProvider>');
  return ctx;
}

export function useCurrentUser(): User {
  const { currentUser } = useApp();
  if (!currentUser) throw new Error('No signed-in user');
  return currentUser;
}

export function useUserLookup(): (id: ID) => User | undefined {
  const { users } = useApp();
  return useCallback((id: ID) => users.find((u) => u.id === id), [users]);
}

export function useCoachForUser(): (userId: ID) => Coach | undefined {
  const { coaches } = useApp();
  return useCallback((userId: ID) => coaches.find((c) => c.userId === userId), [coaches]);
}
