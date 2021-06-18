const effects = new Map();

let currentEffect = null;

const reactive = (object) => {
    if (object === null || typeof object !== "object") {
        return object;
    }

    for (const property in object) {
        object[property] = reactive(object[property]);
    }

    return new Proxy(object, {
        get(target, property) {
            if (currentEffect === null) {
                return target[property];
            }

            if (!effects.has(target)) {
                effects.set(target, {});
            }

            const targetEffects = effects.get(target);

            if (!targetEffects[property]) {
                targetEffects[property] = [];
            }

            targetEffects[property].push(currentEffect);

            return target[property];
        },
        set(target, property, value) {
            target[property] = reactive(value);

            if (effects.has(target)) {
                const targetEffects = effects.get(target)[property] || [];

                targetEffects.forEach((effect) => {
                    effect();
                });
            }

            return true;
        },
    });
};

function effect(callback) {
    currentEffect = callback;

    callback();

    currentEffect = null;
}

document.addEventListener("DOMContentLoaded", () => {
    const elements = document.querySelectorAll("[a-data]");

    elements.forEach((el) => {
        const dataExpression = el.getAttribute("a-data");
        let data = evaluate(dataExpression);

        if (typeof data === "function") {
            data = data();
        }

        data = reactive(data);

        walk(el, data);
    });
});

function walk(el, data, extras = {}) {
    const attributes = Array.from(el.attributes).filter(
        (attr) => attr.name.startsWith("a-") && attr.name !== "a-data"
    ).map(
        (attr) => parseAttr(attr)
    );

    let walkChildren = true

    attributes.forEach((attr) => {
        switch (attr.name) {
            case "a-text":
                handleText(el, attr.expression, data, extras);
                break
            case "a-show":
                handleShow(el, attr.expression, data, extras);
                break
            case "a-on":
                handleOn(el, attr.value, attr.modifiers, attr.expression, data, extras)
                break
            case "a-for":
                walkChildren = false
                handleFor(el, attr.expression, data, extras)
                break
        }
    });

    if (el.children.length > 0 && walkChildren) {
        Array.from(el.children).forEach((child) => {
            walk(child, data, extras);
        });
    }
}

function handleShow(el, expression, data, extras) {
    effect(() => {
        let result = evaluate(expression, data, extras)

        if (!! result) {
            el.style.display = 'block'
        } else {
            el.style.display = 'none'
        }
    })
}

function handleFor(el, expression, data, extras) {
    let [iterator, iterable] = expression.split('in').map(_ => _.trim())

    el.__template = el.children[0]
    el.removeChild(el.children[0])

    effect(() => {
        el.textContent = ''

        const items = evaluate(iterable, data, extras)

        if (!Array.isArray(items)) {
            return
        }

        items.forEach(i => {
            const node = document.importNode(el.__template)

            walk(node, data, { [iterator]: i })

            el.appendChild(node)
        })
    })
}

function handleOn(el, event, modifiers, expression, data, extras) {
    el.addEventListener(event, ($event) => {
        if (modifiers.includes('prevent')) {
            $event.preventDefault()
        }

        if (modifiers.includes('stop')) {
            $event.stopPropagation()
        }

        evaluate(expression, data, {
            '$event': $event,
            ...extras
        })
    })
}

function parseAttr(attr) {
    const [nameAndArgument, ...modifiers] = attr.name.split('.')
    const [name, value] = nameAndArgument.split(':')

    return {
        name: name,
        value: value,
        modifiers: modifiers,
        expression: attr.value,
    }
}

function handleText(el, expression, data, extras) {
    effect(() => {
        el.innerText = evaluate(expression, data, extras);
    });
}

function evaluate(expression, context = {}, extras = {}) {
    const fn = new Function(
        ["context", ...Object.keys(extras)],
        `with (context) { __result = ${expression}; return __result; }`
    );

    return fn(context, ...Object.values(extras));
}

function evaluateLater(expression, context) {
    return (callback) => {
        const result = evaluate(expression, context)

        callback(result)
    }
}
