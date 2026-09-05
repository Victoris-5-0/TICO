import { NextResponse } from 'next/server';

export async function GET() {
  const openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: 'TICO Platform Backend API',
      version: '1.0.0',
      description: `
**TICO Platform API** — Egypt's premier intelligent, narrative-driven Python learning companion for young innovators (ages 10–17).

TICO is a purpose-built educational platform combining authentic Egyptian narrative engineering worlds with adaptive AI pedagogical scaffolding:
- **The Living Egyptian Worlds**: Solve real-world engineering missions across Cairo Metro (fare & transit telemetry), El Forn Bakery (bread inventory & loops), Cairo Traffic Control (6th October Bridge signal automation), and Nile River (water-level algorithms).
- **TICO Intelligent Companion (تيكو)**: A culturally empathetic bilingual (Egyptian Arabic & English) mentor providing Socratic hints and emotional encouragement without spoiling solutions.
- **4-Rung Adaptive Scaffolding Ladder**: Progressive pedagogical assistance (*Orient -> Inquire -> Blueprint -> Precision Fix*) with resilient fallback to static authored hints.
- **Hero Archetypes & Egyptian Relics**: Roleplay as the Cairo Navigator, Nile Hydro-Engineer, or Pyramid Scholar, equipping cyber-pharaonic gear and earning milestone achievements.
- **TICO Mastery Stars**: 3-star dimensional rating evaluating solution correctness, cognitive autonomy (solving without hints), and algorithmic efficiency.
- **Classroom Flight Deck**: Effortless teacher cohort management with instant join codes (\`TICO-XXXX\`) and real-time student progress rosters.
- **Resilient Hybrid Architecture**: Seamless integration with external FastAPI AI services backed by robust local fallbacks for 100% offline gameplay continuity.

*Note: In local development, requests automatically authenticate as the seeded student explorer (\`student@tico.dev\`) if no Supabase Bearer token is provided.*
      `,
    },
    servers: [
      {
        url: 'http://localhost:3000',
        description: 'Local Next.js Development Server',
      },
    ],
    components: {
      securitySchemes: {
        bearerAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'JWT',
          description: 'Supabase access token (optional in local dev).',
        },
      },
      schemas: {
        ErrorResponse: {
          type: 'object',
          properties: {
            error: {
              type: 'object',
              properties: {
                message: { type: 'string' },
                details: { type: 'object' },
              },
            },
          },
        },
        Track: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string', example: 'Cairo Metro' },
            slug: { type: 'string', example: 'cairo-metro' },
            description: { type: 'string' },
            icon: { type: 'string' },
            language: { type: 'string', example: 'python' },
            totalLessons: { type: 'integer', example: 5 },
            totalExercises: { type: 'integer', example: 12 },
            completedLessons: { type: 'integer', example: 2 },
            progressPercent: { type: 'integer', example: 40 },
          },
        },
        Exercise: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            title: { type: 'string', example: 'Ticketing Revenue' },
            instructions: { type: 'string' },
            starterCode: { type: 'string', example: 'def calculate_revenue(passengers, price):\n    # Write your code here\n    pass' },
            difficulty: { type: 'string', enum: ['BEGINNER', 'INTERMEDIATE', 'ADVANCED'] },
            hintCount: { type: 'integer', example: 3 },
            testCases: {
              type: 'array',
              items: {
                type: 'object',
                properties: {
                  input: { type: 'string' },
                  expectedOutput: { type: 'string' },
                },
              },
            },
          },
        },
        PracticeSession: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            userId: { type: 'string' },
            exerciseId: { type: 'string' },
            kind: { type: 'string', enum: ['LESSON', 'DIAGNOSTIC', 'CHALLENGE'] },
            phase: { type: 'string', enum: ['ENCOUNTER', 'EXPLORE', 'DISCOVER', 'UNDERSTAND', 'GUIDED_CODING', 'ADAPT_REMIX', 'INDEPENDENT'] },
            outcome: { type: 'string', enum: ['IN_PROGRESS', 'SOLVED', 'ABANDONED', 'TIMED_OUT'] },
            hintsUsed: { type: 'integer' },
            attemptNumber: { type: 'integer' },
            startedAt: { type: 'string', format: 'date-time' },
          },
        },
        SubmissionInput: {
          type: 'object',
          required: ['sessionId', 'code', 'status'],
          properties: {
            sessionId: { type: 'string', example: 'cmto7imcm0001yivk74wp7283' },
            code: { type: 'string', example: 'def calculate_revenue(passengers, price):\n    return passengers * price' },
            status: { type: 'string', enum: ['PASSED', 'FAILED', 'ERROR', 'TIMEOUT'], example: 'PASSED' },
            output: { type: 'string', example: 'Test passed! All 2 assertions succeeded.' },
            durationMs: { type: 'integer', example: 45 },
          },
        },
        HintInput: {
          type: 'object',
          required: ['sessionId', 'exerciseId'],
          properties: {
            sessionId: { type: 'string' },
            exerciseId: { type: 'string' },
            codeExcerpt: { type: 'string', example: 'x = 10\nprint(y)' },
            lastResult: { type: 'string', enum: ['PASSED', 'FAILED', 'ERROR', 'TIMEOUT'], nullable: true, example: 'FAILED' },
            locale: { type: 'string', example: 'ar-EG' },
          },
        },
        ChatMessageInput: {
          type: 'object',
          required: ['role', 'content'],
          properties: {
            lessonId: { type: 'string', nullable: true, example: 'cmto7imcm0000yivkabc123' },
            role: { type: 'string', enum: ['user', 'assistant'], example: 'user' },
            content: { type: 'string', example: 'How do I multiply variables in Python?' },
          },
        },
        Hero: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            slug: { type: 'string', example: 'cairo-navigator' },
            name: { type: 'string', example: 'Cairo Navigator' },
            title: { type: 'string', example: 'Metro Explorer' },
            description: { type: 'string' },
            avatarUrl: { type: 'string' },
            requiredLevel: { type: 'integer', example: 1 },
            unlocked: { type: 'boolean', example: true },
            equipped: { type: 'boolean', example: false },
          },
        },
        HeroEquipInput: {
          type: 'object',
          required: ['heroId'],
          properties: {
            heroId: { type: 'string', example: 'hero-cairo-navigator' },
          },
        },
        Item: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            slug: { type: 'string', example: 'pharaoh-staff' },
            name: { type: 'string', example: 'Staff of the Pharaoh' },
            description: { type: 'string' },
            type: { type: 'string', enum: ['HAT', 'ROBE', 'STAFF', 'BADGE', 'PET'] },
            rarity: { type: 'string', enum: ['COMMON', 'RARE', 'EPIC', 'LEGENDARY'] },
            costXp: { type: 'integer', example: 250 },
            equipped: { type: 'boolean', example: false },
            owned: { type: 'boolean', example: true },
          },
        },
        Achievement: {
          type: 'object',
          properties: {
            id: { type: 'string' },
            slug: { type: 'string', example: 'first-metro-ticket' },
            title: { type: 'string', example: 'First Metro Ticket' },
            description: { type: 'string', example: 'Complete your very first Python lesson in Cairo Metro.' },
            icon: { type: 'string' },
            xpReward: { type: 'integer', example: 100 },
            unlocked: { type: 'boolean', example: true },
            unlockedAt: { type: 'string', format: 'date-time', nullable: true },
          },
        },
        ClassroomCreateInput: {
          type: 'object',
          required: ['name'],
          properties: {
            name: { type: 'string', example: 'Grade 7 Python Cohort A' },
            trackId: { type: 'string', nullable: true, example: 'cmto7imcm0000yivk1234567' },
          },
        },
        ClassroomJoinInput: {
          type: 'object',
          required: ['joinCode'],
          properties: {
            joinCode: { type: 'string', example: 'TICO-9X2M' },
          },
        },
      },
    },
    paths: {
      '/api/v1/health': {
        get: {
          tags: ['Health'],
          summary: 'System health check',
          description: 'Checks PostgreSQL database connectivity and AI service reachability.',
          responses: {
            200: { description: 'System healthy' },
            503: { description: 'Degraded system' },
          },
        },
      },
      '/api/v1/tracks': {
        get: {
          tags: ['Curriculum (Tracks & Worlds)'],
          summary: 'List all published worlds/tracks',
          description: 'Returns available tracks with lesson counts, exercise counts, and student completion progress.',
          responses: {
            200: { description: 'List of tracks' },
          },
        },
      },
      '/api/v1/tracks/{slug}': {
        get: {
          tags: ['Curriculum (Tracks & Worlds)'],
          summary: 'Get track details and lessons',
          parameters: [
            { name: 'slug', in: 'path', required: true, schema: { type: 'string' }, example: 'cairo-metro' },
          ],
          responses: {
            200: { description: 'Track details with ordered lessons' },
            404: { description: 'Track not found' },
          },
        },
      },
      '/api/v1/lessons/{id}': {
        get: {
          tags: ['Curriculum (Tracks & Worlds)'],
          summary: 'Get lesson content and exercises list',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Lesson content and exercises' },
            404: { description: 'Lesson not found' },
          },
        },
      },
      '/api/v1/exercises/{id}': {
        get: {
          tags: ['Missions (Exercises)'],
          summary: 'Get playable mission data (Anti-Cheat Protected)',
          description: 'Returns starter code, public test cases, and instructions. Omits solutionCode to prevent cheating.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Playable exercise details' },
            404: { description: 'Exercise not found' },
          },
        },
      },
      '/api/v1/sessions': {
        post: {
          tags: ['Practice Sessions'],
          summary: 'Start or retrieve active practice session',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['exerciseId'],
                  properties: {
                    exerciseId: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            201: { description: 'Active session initialized or retrieved' },
          },
        },
      },
      '/api/v1/sessions/{id}': {
        get: {
          tags: ['Practice Sessions'],
          summary: 'Get session details and stats',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Session details with past submissions and hints' },
            404: { description: 'Session not found' },
          },
        },
        patch: {
          tags: ['Practice Sessions'],
          summary: 'Update session outcome',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['outcome'],
                  properties: {
                    outcome: { type: 'string', enum: ['IN_PROGRESS', 'SOLVED', 'ABANDONED', 'TIMED_OUT'] },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Session outcome updated' },
          },
        },
      },
      '/api/v1/submissions': {
        post: {
          tags: ['Submissions & Code Evaluation'],
          summary: 'Submit code execution result',
          description: 'Atomically creates submission record, analyzes errors via AI/fallback, awards 100 XP on first pass, updates streak, and triggers async mastery refresh.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/SubmissionInput' },
              },
            },
          },
          responses: {
            201: { description: 'Submission processed with XP and stats' },
          },
        },
        get: {
          tags: ['Submissions & Code Evaluation'],
          summary: 'Get past submissions history',
          parameters: [
            { name: 'exerciseId', in: 'query', schema: { type: 'string' } },
            { name: 'sessionId', in: 'query', schema: { type: 'string' } },
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            200: { description: 'List of past submissions' },
          },
        },
      },
      '/api/v1/hints': {
        post: {
          tags: ['Adaptive Hints'],
          summary: 'Request progressive hint (Rungs 1-4)',
          description: 'Determines the next rung based on prior session hints, requests AI hint or falls back gracefully to static hint, and logs HintEvent and AiInteraction.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HintInput' },
              },
            },
          },
          responses: {
            200: { description: 'Hint generated with rung and source (AI or FALLBACK)' },
          },
        },
      },
      '/api/v1/companion/chat': {
        get: {
          tags: ['TICO Companion Chat'],
          summary: 'Get companion chat history',
          parameters: [
            { name: 'lessonId', in: 'query', schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Chat message history' },
          },
        },
        post: {
          tags: ['TICO Companion Chat'],
          summary: 'Append message to companion chat',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ChatMessageInput' },
              },
            },
          },
          responses: {
            201: { description: 'Message appended' },
          },
        },
      },
      '/api/v1/users/me': {
        get: {
          tags: ['User Profile & Leaderboard'],
          summary: 'Get current student profile & coding metrics',
          responses: {
            200: { description: 'Student profile with XP, streak, and completion statistics' },
          },
        },
        patch: {
          tags: ['User Profile & Leaderboard'],
          summary: 'Update student profile',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    name: { type: 'string' },
                    bio: { type: 'string' },
                    avatarUrl: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Profile updated' },
          },
        },
      },
      '/api/v1/leaderboard': {
        get: {
          tags: ['User Profile & Leaderboard'],
          summary: 'Get student XP leaderboard',
          parameters: [
            { name: 'limit', in: 'query', schema: { type: 'integer', default: 20 } },
          ],
          responses: {
            200: { description: 'Top students ranked by XP' },
          },
        },
      },
      '/api/v1/ai/hints': {
        post: {
          tags: ['AI Service Proxies'],
          summary: 'AI Hint Proxy (with resilient fallback)',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HintInput' },
              },
            },
          },
          responses: {
            200: { description: 'Hint response' },
          },
        },
      },
      '/api/v1/ai/submissions/analyze': {
        post: {
          tags: ['AI Service Proxies'],
          summary: 'AI code failure analysis proxy',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['sessionId', 'attemptNumber', 'code'],
                  properties: {
                    sessionId: { type: 'string' },
                    attemptNumber: { type: 'integer', example: 1 },
                    code: { type: 'string' },
                    errorOutput: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Error family and tag' },
          },
        },
      },
      '/api/v1/ai/missions/next': {
        post: {
          tags: ['AI Service Proxies'],
          summary: 'Adaptive next mission proxy',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  required: ['lessonId'],
                  properties: {
                    lessonId: { type: 'string' },
                    worldManifestVersion: { type: 'string', default: '1.0.0' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Next mission ID' },
          },
        },
      },
      '/api/v1/ai/students/{id}/plan': {
        post: {
          tags: ['AI Service Proxies'],
          summary: 'Student path planning proxy',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    diagnostic: { type: 'object' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Required and optional lessons' },
          },
        },
      },
      '/api/v1/ai/students/{id}/refresh': {
        post: {
          tags: ['AI Service Proxies'],
          summary: 'Student model mastery refresh proxy',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    watermark: { type: 'string' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Mastery deltas' },
          },
        },
      },
      '/api/v1/ai/tico/messages': {
        post: {
          tags: ['AI Service Proxies'],
          summary: 'Stream TICO companion chat (SSE)',
          description: 'Streams Server-Sent Events from the AI companion.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    message: { type: 'string' },
                    locale: { type: 'string', example: 'ar-EG' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'text/event-stream response' },
          },
        },
      },
      '/api/v1/ai/mentor/messages': {
        post: {
          tags: ['AI Service Proxies'],
          summary: 'Stream mentor coaching messages (SSE)',
          description: 'Streams Server-Sent Events from LangGraph coaching thread (thread = sessionId).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    sessionId: { type: 'string' },
                    message: { type: 'string' },
                    locale: { type: 'string', example: 'ar-EG' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'text/event-stream response' },
          },
        },
      },
      '/api/v1/ai/missions/generate': {
        post: {
          tags: ['AI Service Proxies'],
          summary: 'Generate dynamic mission scenario',
          description: 'Invokes LangGraph generation pipeline (generate -> validate -> repair x2) using closed world manifests.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    lessonId: { type: 'string' },
                    concept: { type: 'string', example: 'loops' },
                    worldManifestVersion: { type: 'string', default: '1.0.0' },
                    scaffoldLevel: { type: 'string', enum: ['NONE', 'PARTIAL', 'FULL'] },
                    locale: { type: 'string', example: 'ar-EG' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Validated generated mission payload' },
          },
        },
      },
      '/api/v1/ai/challenges/next': {
        post: {
          tags: ['AI Service Proxies'],
          summary: 'Request next challenge arena mission',
          description: 'Generates or retrieves an unscaffolded, mixed-concept challenge scenario for advanced students.',
          requestBody: {
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    worldSlug: { type: 'string', example: 'cairo-metro' },
                  },
                },
              },
            },
          },
          responses: {
            200: { description: 'Challenge scenario' },
          },
        },
      },
      '/api/v1/sessions/{id}/debrief': {
        get: {
          tags: ['Practice Sessions'],
          summary: 'Generate pedagogical session debrief',
          description: 'Evaluates session evidence (attempts, hints, error families, duration) and provides Socratic feedback.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Session debrief with TICO feedback and stars earned' },
          },
        },
        post: {
          tags: ['Practice Sessions'],
          summary: 'Generate pedagogical session debrief',
          description: 'Evaluates session evidence (attempts, hints, error families, duration) and provides Socratic feedback.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Session debrief with TICO feedback and stars earned' },
          },
        },
      },
      '/api/v1/heroes': {
        get: {
          tags: ['Game & RPG (Heroes, Gear, Achievements)'],
          summary: 'List student heroes and unlock state',
          description: 'Fetches all available heroes in TICO with student unlock status and active equipment flag.',
          responses: {
            200: { description: 'List of heroes with unlock states' },
          },
        },
      },
      '/api/v1/heroes/equip': {
        post: {
          tags: ['Game & RPG (Heroes, Gear, Achievements)'],
          summary: 'Equip active hero',
          description: 'Equips a hero character for the student avatar in game worlds.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/HeroEquipInput' },
              },
            },
          },
          responses: {
            200: { description: 'Hero equipped successfully' },
            400: { description: 'Hero not unlocked yet' },
          },
        },
      },
      '/api/v1/items': {
        get: {
          tags: ['Game & RPG (Heroes, Gear, Achievements)'],
          summary: 'List shop items and player inventory',
          description: 'Retrieves all equippable gear (hats, robes, staffs, badges, pets) with ownership and equip status.',
          responses: {
            200: { description: 'List of game items and gear' },
          },
        },
      },
      '/api/v1/achievements': {
        get: {
          tags: ['Game & RPG (Heroes, Gear, Achievements)'],
          summary: 'List achievements and unlock progress',
          description: 'Returns all milestone badges and unlocks with completion status.',
          responses: {
            200: { description: 'List of achievements' },
          },
        },
      },
      '/api/v1/classrooms': {
        get: {
          tags: ['Classrooms & Teachers'],
          summary: 'List teacher classrooms',
          description: 'Returns all cohorts/classrooms managed by the authenticated teacher with student counts and join codes.',
          responses: {
            200: { description: 'List of teacher classrooms' },
          },
        },
        post: {
          tags: ['Classrooms & Teachers'],
          summary: 'Create classroom cohort',
          description: 'Generates a new classroom cohort with an auto-generated join code (e.g. TICO-4X8K).',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ClassroomCreateInput' },
              },
            },
          },
          responses: {
            201: { description: 'Classroom created successfully' },
          },
        },
      },
      '/api/v1/classrooms/join': {
        post: {
          tags: ['Classrooms & Teachers'],
          summary: 'Join classroom via code',
          description: 'Enrolls the student into a teacher classroom using a 4-character join code.',
          requestBody: {
            required: true,
            content: {
              'application/json': {
                schema: { $ref: '#/components/schemas/ClassroomJoinInput' },
              },
            },
          },
          responses: {
            200: { description: 'Successfully joined classroom' },
            404: { description: 'Invalid join code' },
          },
        },
      },
      '/api/v1/classrooms/{id}': {
        get: {
          tags: ['Classrooms & Teachers'],
          summary: 'Get classroom details & student roster',
          description: 'Returns classroom metadata, curriculum progress, and student roster with XP/streak stats.',
          parameters: [
            { name: 'id', in: 'path', required: true, schema: { type: 'string' } },
          ],
          responses: {
            200: { description: 'Classroom roster and stats' },
            404: { description: 'Classroom not found' },
          },
        },
      },
    },
  };

  return NextResponse.json(openApiSpec);
}
