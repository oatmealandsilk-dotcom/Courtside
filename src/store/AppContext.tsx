import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { Platform } from 'react-native';

import { fetchBootstrap, signIn as apiSignIn, type Bootstrap } from '@/data/api';
import { markMessagesOpened } from '@/features/messaging/readReceipts';
import { readReceiptPreference, saveReceiptPreference } from '@/features/messaging/preferences';
import { connectProvider, disconnectProvider } from '@/lib/integrations';
import * as haptics from '@/lib/haptics';
import type {
  Answer,
  Coach,
  CoachApplication,
  CoachingRequest,
  CoachQuestion,
  CoachReply,
  CoachSpecialty,
  Comment,
  Conversation,
  ID,
  Integration,
  MatchResult,
  Message,
  Notification,
  NotificationTarget,
  Post,
  PostKind,
  Question,
  QuestionTopic,
  SavedItems,
  SessionDetail,
  User,
  PlayerProfile,
} from '@/data/types';

interface NewPostInput {
  kind: PostKind;
  body: string;
  tags: string[];
  match?: MatchResult;
  session?: SessionDetail;
  mediaLabel?: string;
  imageUrl?: string;
  videoUrl?: string;
  thumbnailUrl?: string;
}

interface NewCoachQuestionInput {
  title: string;
  body: string;
  specialty: CoachSpecialty;
  videoUrl?: string;
  mediaLabel?: string;
}

export type CoachApplicationInput = Omit<CoachApplication, 'id' | 'userId' | 'status' | 'createdAt'>;

interface NewQuestionInput {
  title: string;
  body: string;
  topic: QuestionTopic;
  tags: string[];
}

/**
 * Files a notification, unless you caused it yourself — nobody wants to be told
 * they liked their own post. Pure, so it composes inside a setState updater.
 */
function withNotification(
  state: AppState,
  entry: {
    userId: ID;
    actorId: ID;
    kind: Notification['kind'];
    targetId: ID;
    targetKind: NotificationTarget;
    preview?: string;
  },
): AppState {
  if (!entry.userId || entry.userId === entry.actorId) return state;
  const notification: Notification = {
    ...entry,
    id: nextId('n'),
    createdAt: new Date().toISOString(),
    read: false,
  };
  return { ...state, notifications: [notification, ...state.notifications] };
}

/** First line of a body, trimmed to something that fits one row. */
function snippet(text: string, max = 80): string {
  const flat = text.replace(/\s+/g, ' ').trim();
  return flat.length > max ? `${flat.slice(0, max - 1)}…` : flat;
}

/** What a double tap leaves, remembered between visits on web. */
function readDefaultReaction(): string {
  try {
    if (Platform.OS !== 'web') return '❤️';
    return localStorage.getItem('courtside-default-reaction') || '❤️';
  } catch {
    return '❤️';
  }
}

interface AppState extends Bootstrap {
  ready: boolean;
  /** What a double tap leaves on a message. */
  defaultReaction: string;
  currentUserId: ID | null;
  onboardingComplete: boolean;
  error: string | null;
  saved: SavedItems;
}

interface AppActions {
  setReadReceiptsEnabled: (enabled: boolean) => void;
  signIn: (handle: string) => Promise<void>;
  signOut: () => void;
  completeOnboarding: (profile: PlayerProfile) => void;
  updateIdentity: (patch: Pick<User, 'name' | 'bio' | 'location'> & { avatarUrl?: string }) => void;
  updateProfile: (patch: Partial<PlayerProfile>) => void;

  toggleLike: (postId: ID) => void;
  addPost: (input: NewPostInput) => ID;
  addComment: (postId: ID, body: string) => void;

  addQuestion: (input: NewQuestionInput) => ID;
  voteQuestion: (questionId: ID, direction: 1 | -1) => void;
  addAnswer: (questionId: ID, body: string, parentAnswerId?: ID) => void;
  voteAnswer: (answerId: ID, direction: 1 | -1) => void;

  submitCoachingRequest: (coachId: ID, serviceId: ID, question: string, videoLabel?: string) => ID;
  toggleIntegration: (provider: Integration['provider']) => Promise<void>;

  /* Ask a coach */
  askCoach: (input: NewCoachQuestionInput) => ID;
  replyToCoachQuestion: (questionId: ID, body: string) => void;
  toggleReplyHelpful: (replyId: ID) => void;

  /* Become a coach */
  submitCoachApplication: (input: CoachApplicationInput) => ID;

  /* Saved */
  toggleSavePost: (postId: ID) => void;
  toggleSaveQuestion: (questionId: ID) => void;

  /* Reactions */
  reactToMessage: (messageId: ID, emoji?: string) => void;
  setDefaultReaction: (emoji: string) => void;

  /* Notifications */
  markNotificationsRead: () => void;
  markNotificationRead: (notificationId: ID) => void;

  /* Counting */
  recordView: (targetKind: 'post' | 'question', targetId: ID) => void;

  /* Messaging */
  openConversationWith: (userId: ID) => ID;
  sendMessage: (conversationId: ID, body: string) => void;
  shareToUsers: (userIds: ID[], kind: 'post' | 'question' | 'profile', sharedId: ID, note?: string) => void;
  markConversationRead: (conversationId: ID) => void;
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
  coachQuestions: [],
  coachReplies: [],
  coachApplications: [],
  conversations: [],
  messages: [],
  notifications: [],
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
    saved: { postIds: [], questionIds: [] },
    defaultReaction: readDefaultReaction(),
  });

  useEffect(() => {
    let cancelled = false;
    fetchBootstrap()
      .then((data) => {
        if (cancelled) return;
        setState((prev) => ({ ...prev, ...data, users: data.users.map(user => ({...user, readReceiptsEnabled: readReceiptPreference(user.id)})), ready: true }));
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

  const updateIdentity = useCallback((patch: Pick<User, 'name' | 'bio' | 'location'> & { avatarUrl?: string }) => { patchCurrentUser(u => ({ ...u, ...patch })); }, [patchCurrentUser]);
  const setReadReceiptsEnabled = useCallback((enabled: boolean) => {
    const me = requireUser();
    saveReceiptPreference(me, enabled);
    patchCurrentUser(user => ({...user, readReceiptsEnabled: enabled}));
  }, [requireUser, patchCurrentUser]);

  const updateProfile = useCallback(
    (patch: Partial<PlayerProfile>) => {
      patchCurrentUser((u) => ({ ...u, profile: { ...u.profile, ...patch } }));
    },
    [patchCurrentUser],
  );

  // Keep a ref so async actions read fresh state without re-creating callbacks.
  const stateRef = React.useRef(state);
  stateRef.current = state;

  const toggleLike = useCallback(
    (postId: ID) => {
      const me = requireUser();
      setState((prev) => {
        const post = prev.posts.find((p) => p.id === postId);
        const liking = !!post && !post.likedBy.includes(me);
        liking ? haptics.tap() : haptics.untap();
        const next: AppState = {
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
        };
        // Only the like fires a notification; taking it back should not.
        return liking && post
          ? withNotification(next, {
              userId: post.authorId,
              actorId: me,
              kind: 'like',
              targetId: post.id,
              targetKind: 'post',
              preview: snippet(post.body),
            })
          : next;
      });
    },
    [requireUser],
  );

  const addPost = useCallback(
    (input: NewPostInput): ID => {
      const me = requireUser();
      haptics.commit();
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
      haptics.commit();
      setState((prev) => {
        const post = prev.posts.find((p) => p.id === postId);
        const next: AppState = {
          ...prev,
          comments: [...prev.comments, comment],
          posts: prev.posts.map((p) =>
            p.id === postId ? { ...p, commentIds: [...p.commentIds, comment.id] } : p,
          ),
        };
        return post
          ? withNotification(next, {
              userId: post.authorId,
              actorId: me,
              kind: 'comment',
              targetId: post.id,
              targetKind: 'post',
              preview: snippet(body),
            })
          : next;
      });
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
      haptics.tap();
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
      haptics.tap();
      const me = requireUser();
      setState((prev) => ({
        ...prev,
        answers: prev.answers.map((a) => (a.id === answerId ? applyVote(a, me, direction) : a)),
      }));
    },
    [requireUser],
  );

  const addAnswer = useCallback(
    (questionId: ID, body: string, parentAnswerId?: ID) => {
      const me = requireUser();
      setState((prev) => {
        const author = prev.users.find((u) => u.id === me);
        const answer: Answer = {
          id: nextId('a'),
          parentAnswerId: prev.answers.some(a => a.id === parentAnswerId && a.questionId === questionId) ? parentAnswerId : undefined,
          questionId,
          authorId: me,
          body,
          createdAt: new Date().toISOString(),
          votes: 0,
          votedBy: {},
          fromCoach: Boolean(author?.isCoach),
        };
        const question = prev.questions.find((q) => q.id === questionId);
        const parent = prev.answers.find((a) => a.id === answer.parentAnswerId);
        let next: AppState = {
          ...prev,
          answers: [...prev.answers, answer],
          questions: prev.questions.map((q) =>
            q.id === questionId ? { ...q, answerIds: [...q.answerIds, answer.id] } : q,
          ),
        };
        if (question) {
          next = withNotification(next, {
            userId: question.authorId,
            actorId: me,
            kind: 'answer',
            targetId: question.id,
            targetKind: 'question',
            preview: snippet(body),
          });
        }
        // A reply under someone else's answer should reach them too.
        if (parent && parent.authorId !== question?.authorId) {
          next = withNotification(next, {
            userId: parent.authorId,
            actorId: me,
            kind: 'answer',
            targetId: questionId,
            targetKind: 'question',
            preview: snippet(body),
          });
        }
        return next;
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

  /* ------------------------------ Ask a coach ----------------------------- */

  const askCoach = useCallback(
    (input: NewCoachQuestionInput): ID => {
      const me = requireUser();
      const question: CoachQuestion = {
        id: nextId('cq'),
        authorId: me,
        createdAt: new Date().toISOString(),
        replyIds: [],
        resolved: false,
        ...input,
      };
      setState((prev) => ({ ...prev, coachQuestions: [question, ...prev.coachQuestions] }));
      return question.id;
    },
    [requireUser],
  );

  const replyToCoachQuestion = useCallback(
    (questionId: ID, body: string, parentAnswerId?: ID) => {
      const me = requireUser();
      const reply: CoachReply = {
        id: nextId('cr'),
        questionId,
        coachUserId: me,
        body,
        createdAt: new Date().toISOString(),
        helpfulBy: [],
      };
      haptics.commit();
      setState((prev) => {
        const question = prev.coachQuestions.find((q) => q.id === questionId);
        const next: AppState = {
          ...prev,
          coachReplies: [...prev.coachReplies, reply],
          coachQuestions: prev.coachQuestions.map((q) =>
            q.id === questionId ? { ...q, replyIds: [...q.replyIds, reply.id] } : q,
          ),
        };
        return question
          ? withNotification(next, {
              userId: question.authorId,
              actorId: me,
              kind: 'coach-reply',
              targetId: question.id,
              targetKind: 'coach-question',
              preview: snippet(body),
            })
          : next;
      });
    },
    [requireUser],
  );

  const toggleReplyHelpful = useCallback(
    (replyId: ID) => {
      const me = requireUser();
      setState((prev) => {
        const reply = prev.coachReplies.find((r) => r.id === replyId);
        const marking = !!reply && !reply.helpfulBy.includes(me);
        marking ? haptics.tap() : haptics.untap();
        const next: AppState = {
          ...prev,
          coachReplies: prev.coachReplies.map((r) =>
            r.id === replyId
              ? {
                  ...r,
                  helpfulBy: r.helpfulBy.includes(me)
                    ? r.helpfulBy.filter((id) => id !== me)
                    : [...r.helpfulBy, me],
                }
              : r,
          ),
        };
        return marking && reply
          ? withNotification(next, {
              userId: reply.coachUserId,
              actorId: me,
              kind: 'helpful',
              targetId: reply.questionId,
              targetKind: 'coach-question',
              preview: snippet(reply.body),
            })
          : next;
      });
    },
    [requireUser],
  );

  /* --------------------------- Coach application -------------------------- */

  const submitCoachApplication = useCallback(
    (input: CoachApplicationInput): ID => {
      const me = requireUser();
      const application: CoachApplication = {
        id: nextId('ca'),
        userId: me,
        status: 'submitted',
        createdAt: new Date().toISOString(),
        ...input,
      };
      setState((prev) => ({ ...prev, coachApplications: [application, ...prev.coachApplications] }));
      return application.id;
    },
    [requireUser],
  );

  /* --------------------------------- Saved -------------------------------- */

  /**
   * Toggles your reaction on a message. Passing no emoji uses the double-tap
   * default; reacting again with the same emoji takes it back off.
   */
  const reactToMessage = useCallback((messageId: ID, emoji?: string) => {
    setState((prev) => {
      const me = prev.currentUserId;
      if (!me) return prev;
      const mark = emoji ?? prev.defaultReaction;
      const message = prev.messages.find((m) => m.id === messageId);
      const existing = message?.reactions?.[me];
      existing === mark ? haptics.untap() : haptics.tap();
      return {
        ...prev,
        messages: prev.messages.map((m) => {
          if (m.id !== messageId) return m;
          const reactions = { ...(m.reactions ?? {}) };
          if (reactions[me] === mark) delete reactions[me];
          else reactions[me] = mark;
          return { ...m, reactions };
        }),
      };
    });
  }, []);

  const setDefaultReaction = useCallback((emoji: string) => {
    setState((prev) => ({ ...prev, defaultReaction: emoji }));
    try {
      if (Platform.OS === 'web') localStorage.setItem('courtside-default-reaction', emoji);
    } catch {}
  }, []);

  const markNotificationsRead = useCallback(() => {
    setState((prev) =>
      prev.notifications.some((n) => !n.read)
        ? { ...prev, notifications: prev.notifications.map((n) => ({ ...n, read: true })) }
        : prev,
    );
  }, []);

  const markNotificationRead = useCallback((notificationId: ID) => {
    setState((prev) => ({
      ...prev,
      notifications: prev.notifications.map((n) =>
        n.id === notificationId ? { ...n, read: true } : n,
      ),
    }));
  }, []);

  /**
   * Counts a view once per item per session. Without the guard, scrolling a reel
   * back into sight would inflate the number every time it passed.
   */
  const seenThisSession = useRef<Set<string>>(new Set());
  const recordView = useCallback((targetKind: 'post' | 'question', targetId: ID) => {
    const key = `${targetKind}:${targetId}`;
    if (seenThisSession.current.has(key)) return;
    seenThisSession.current.add(key);
    setState((prev) =>
      targetKind === 'post'
        ? {
            ...prev,
            posts: prev.posts.map((p) =>
              p.id === targetId ? { ...p, views: (p.views ?? 0) + 1 } : p,
            ),
          }
        : {
            ...prev,
            questions: prev.questions.map((q) =>
              q.id === targetId ? { ...q, views: (q.views ?? 0) + 1 } : q,
            ),
          },
    );
  }, []);

  const toggleSavePost = useCallback((postId: ID) => {
    setState((prev) => {
      const me = prev.currentUserId;
      const saving = !prev.saved.postIds.includes(postId);
      saving ? haptics.tap() : haptics.untap();
      return {
        ...prev,
        saved: {
          ...prev.saved,
          postIds: saving
            ? [postId, ...prev.saved.postIds]
            : prev.saved.postIds.filter((id) => id !== postId),
        },
        // savedBy is the public tally; saved.postIds is just this user's shelf.
        posts: prev.posts.map((p) => {
          if (p.id !== postId || !me) return p;
          const savedBy = p.savedBy ?? [];
          return {
            ...p,
            savedBy: saving ? [...new Set([...savedBy, me])] : savedBy.filter((id) => id !== me),
          };
        }),
      };
    });
  }, []);

  const toggleSaveQuestion = useCallback((questionId: ID) => {
    setState((prev) => {
      const me = prev.currentUserId;
      const saving = !prev.saved.questionIds.includes(questionId);
      saving ? haptics.tap() : haptics.untap();
      return {
        ...prev,
        saved: {
          ...prev.saved,
          questionIds: saving
            ? [questionId, ...prev.saved.questionIds]
            : prev.saved.questionIds.filter((id) => id !== questionId),
        },
        questions: prev.questions.map((q) => {
          if (q.id !== questionId || !me) return q;
          const savedBy = q.savedBy ?? [];
          return {
            ...q,
            savedBy: saving ? [...new Set([...savedBy, me])] : savedBy.filter((id) => id !== me),
          };
        }),
      };
    });
  }, []);

  /* ------------------------------- Messaging ------------------------------ */

  /** Returns the existing 1:1 thread with a user, creating one if needed. */
  const openConversationWith = useCallback(
    (userId: ID): ID => {
      const me = requireUser();
      const existing = stateRef.current.conversations.find(
        (c) => c.participantIds.length === 2 && c.participantIds.includes(userId) && c.participantIds.includes(me),
      );
      if (existing) return existing.id;

      const conversation: Conversation = {
        id: nextId('cv'),
        participantIds: [me, userId],
        messageIds: [],
        updatedAt: new Date().toISOString(),
        unreadCount: 0,
      };
      setState((prev) => ({ ...prev, conversations: [conversation, ...prev.conversations] }));
      return conversation.id;
    },
    [requireUser],
  );

  const appendMessage = useCallback(
    (
      prev: AppState,
      conversationId: ID,
      senderId: ID,
      body: string,
      kind: Message['kind'] = 'text',
      sharedId?: ID,
    ): AppState => {
      const message: Message = {
        id: nextId('m'),
        conversationId,
        senderId,
        body,
        createdAt: new Date().toISOString(),
        kind,
        sharedId,
      };
      return {
        ...prev,
        messages: [...prev.messages, message],
        conversations: prev.conversations.map((c) =>
          c.id === conversationId
            ? { ...c, messageIds: [...c.messageIds, message.id], updatedAt: message.createdAt }
            : c,
        ),
      };
    },
    [],
  );

  const sendMessage = useCallback(
    (conversationId: ID, body: string) => {
      haptics.commit();
      const me = requireUser();
      const trimmed = body.trim();
      if (!trimmed) return;
      setState((prev) => appendMessage(prev, conversationId, me, trimmed));
    },
    [requireUser, appendMessage],
  );

  /** Share a reel or a thread into one or more DMs, Instagram style. */
  const shareToUsers = useCallback(
    (userIds: ID[], kind: 'post' | 'question' | 'profile', sharedId: ID, note?: string) => {
      const me = requireUser();
      setState((prev) => {
        let next = prev;
        for (const userId of userIds) {
          let conversation = next.conversations.find(
            (c) => c.participantIds.length === 2 && c.participantIds.includes(userId) && c.participantIds.includes(me),
          );
          if (!conversation) {
            conversation = {
              id: nextId('cv'),
              participantIds: [me, userId],
              messageIds: [],
              updatedAt: new Date().toISOString(),
              unreadCount: 0,
            };
            next = { ...next, conversations: [conversation, ...next.conversations] };
          }
          next = appendMessage(next, conversation.id, me, '', kind, sharedId);
          if (note?.trim()) next = appendMessage(next, conversation.id, me, note.trim());
        }

        // One share tally per send, however many people it went to.
        if (kind === 'post') {
          const post = next.posts.find((p) => p.id === sharedId);
          next = {
            ...next,
            posts: next.posts.map((p) =>
              p.id === sharedId ? { ...p, shares: (p.shares ?? 0) + userIds.length } : p,
            ),
          };
          if (post) {
            next = withNotification(next, {
              userId: post.authorId,
              actorId: me,
              kind: 'share',
              targetId: post.id,
              targetKind: 'post',
              preview: snippet(post.body),
            });
          }
        } else if (kind === 'question') {
          const question = next.questions.find((q) => q.id === sharedId);
          next = {
            ...next,
            questions: next.questions.map((q) =>
              q.id === sharedId ? { ...q, shares: (q.shares ?? 0) + userIds.length } : q,
            ),
          };
          if (question) {
            next = withNotification(next, {
              userId: question.authorId,
              actorId: me,
              kind: 'share',
              targetId: question.id,
              targetKind: 'question',
              preview: snippet(question.title),
            });
          }
        }
        return next;
      });
    },
    [requireUser, appendMessage],
  );

  const markConversationRead = useCallback((conversationId: ID) => {
    setState(prev => {
      const conversation = prev.conversations.find(c => c.id === conversationId);
      const me = prev.currentUserId;
      if (!conversation || !me || !conversation.participantIds.includes(me)) return prev;
      const user = prev.users.find(u => u.id === me);
      const messages = markMessagesOpened(prev.messages, conversation, me, user?.readReceiptsEnabled !== false, new Date().toISOString());
      if (messages === prev.messages && conversation.unreadCount === 0) return prev;
      return {...prev, messages, conversations: prev.conversations.map(c => c.id === conversationId ? {...c, unreadCount: 0} : c)};
    });
  }, []);

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
      setReadReceiptsEnabled,
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
      askCoach,
      replyToCoachQuestion,
      toggleReplyHelpful,
      submitCoachApplication,
      toggleSavePost,
      toggleSaveQuestion,
      reactToMessage,
      setDefaultReaction,
      markNotificationsRead,
      markNotificationRead,
      recordView,
      openConversationWith,
      sendMessage,
      shareToUsers,
      markConversationRead,
    }),
    [
      setReadReceiptsEnabled,
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
      askCoach,
      replyToCoachQuestion,
      toggleReplyHelpful,
      submitCoachApplication,
      toggleSavePost,
      toggleSaveQuestion,
      reactToMessage,
      setDefaultReaction,
      markNotificationsRead,
      markNotificationRead,
      recordView,
      openConversationWith,
      sendMessage,
      shareToUsers,
      markConversationRead,
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
