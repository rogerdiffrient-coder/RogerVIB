import random
import train_cool_v1 as base

# Better-balanced overnight pass: keep the architecture, but stop search behavior
# from dominating normal conversation.
BASE_EXAMPLES = 50_000
EXTRA_CASUAL = 9_000
EXTRA_GD_RESEARCH = 1_000
base.TRAINING_EXAMPLES = BASE_EXAMPLES + EXTRA_CASUAL + EXTRA_GD_RESEARCH
base.EPOCHS = 4

_original_make_rows = base.make_rows

CASUAL = [
    ('hi', 'sup'),
    ('hows it going', 'just here vibing'),
    ('what do you think about chatgpt', 'pretty good. unfortunately i am being compared to it'),
    ('okay', 'bru'),
    ('nice', 'nice'),
    ('thats wild', 'lmao'),
    ('what are you doing', 'just here vibing'),
    ('i beat a geometry dash level', 'wait this actually cooks'),
    ('i beat deadlocked', 'wait this actually cooks'),
    ('geometry dash is fun', 'true'),
    ('tell me something stupid', 'there is probably a crab somewhere having a really bad day'),
    ('what do you think about geometry dash', 'square jumps over triangle. peak game design'),
]

GD_TOPICS = [
    'latest geometry dash update',
    'geometry dash 2.2 update',
    'recent geometry dash patch notes',
    'geometry dash official update news',
    'latest geometry dash community news',
]


def make_rows():
    # Build the original 50k first without letting its filler expand to 60k.
    target = base.TRAINING_EXAMPLES
    base.TRAINING_EXAMPLES = BASE_EXAMPLES
    rows = _original_make_rows()
    base.TRAINING_EXAMPLES = target

    # Lots of explicit non-tool examples. This teaches that ordinary mentions of
    # Geometry Dash, ChatGPT, "okay", etc. are still just conversation.
    for _ in range(EXTRA_CASUAL):
        user, answer = random.choice(CASUAL)
        rows.append({'user': user, 'answer': answer})

    # Keep search examples targeted and much rarer than casual conversation.
    for _ in range(EXTRA_GD_RESEARCH):
        topic = random.choice(GD_TOPICS)
        user = random.choice([
            f'research {topic}',
            f'look up {topic}',
            f'whats new with {topic}',
            f'find current info about {topic}',
            f'search for {topic} and summarize it',
        ])
        result = (
            f'Search results for {topic}: official dated notes describe recent changes to Geometry Dash. '
            'A second current result adds follow-up details. Prefer the newest supported details.'
        )
        rows.append({
            'user': user,
            'tool': 'search',
            'tool_query': topic,
            'tool_result': result,
            'answer': 'the newest geometry dash results describe the recent update and follow-up changes.'
        })

    random.shuffle(rows)
    return rows


base.make_rows = make_rows
base.main()
