---
id: server-side-rendering
title: Server-Side Rendering
sidebar_label: Server-Side Rendering
---

## State Serialization

When rendering on the server, there usually is the need to hydrate the
server-rendered website on the client using the same state as on the server. To
help with that, the
[`@feature-hub/serialized-state-manager`][serialized-state-manager-api] package
provides the **Serialized State Manager** Feature Service that enables
consumers, i.e. Feature Apps and Feature Services, to store their serialized
state on the server, and retrieve it again on the client during hydration.

### As a Consumer

Using the Serialized State Manager as a dependency, a consumer (in this case a
Feature Service) could serialize its state like this:

```js
const myFeatureServiceDefinition = {
  id: 'acme:my-feature-service',

  dependencies: {
    's2:serialized-state-manager': '^0.1'
  },

  create(env) {
    let count = 0;

    const serializedStateManager =
      env.featureServices['s2:serialized-state-manager'];

    if (typeof window === 'undefined') {
      // on the server
      serializedStateManager.register(() => JSON.stringify({count}));
    } else {
      // on the client
      count = JSON.parse(serializedStateManager.getSerializedState()).count;
    }

    return {
      '1.0': () => ({
        featureService: {
          // We assume the setCount method is called by consumers while they are
          // rendered on the server.
          setCount(newCount) {
            count = newCount;
          },

          getCount() {
            return count;
          }
        }
      })
    };
  }
};
```

On the server, Feature Apps and Feature Services register a callback that
serializes their state with the `register` method. This callback is called after
server-side rendering is completed. On the client, they retrieve their
serialized state again with `getSerializedState`, and deserialize it.

In the example above, `JSON.stringify` is used for serialization, and
`JSON.parse` is used for deserialization.

### As the Integrator

The integrator has the responsibility to transfer all serialized consumer states
from the server to the client.

On the server, the Serialized State Manager provides a `serializeStates` method,
that serializes all consumer states. After server-side rendering is completed,
[the integrator must obtain the Feature Service][consuming-feature-services] and
call this method:

```js
const serializedStates = serializedStateManager.serializeStates();
```

The `serializedStates` string is encoded so that it can be safely injected into
the HTML document, e.g. [as text content of a custom script
element][demos-inject-serialized-states-script].

On the client before hydrating, this string must be extracted from the HTML
document, e.g. [from the text content of the custom script
element][demos-extract-serialized-states-script], and passed unmodified into the
`setSerializedStates` method, where it will be decoded again:

```js
serializedStateManager.setSerializedStates(serializedStates);
```

Now the hydration can be started, and consumers will be able to
[retrieve their serialized state from the Serialized State Manager](#as-a-consumer).

## Preloading Feature Apps on the Client

**Note:** This feature is currently in development, see [#27][issue-27] for
details.

## Server-Side Rendering Using React

Since React does not yet support asynchronous rendering on the server, the
[`@feature-hub/async-ssr-manager`][async-ssr-manager-api] package provides the
**Async SSR Manager** Feature Service that enables the integrator to render any
given composition of React Feature Apps in multiple render passes until all
Feature Apps and Feature Services have finished their asynchronous operations.

### As a Feature App

A Feature App that, for example, needs to fetch data asynchronously when it is
initially rendered, must define the Async SSR Manager as an optional dependency
in its Feature App definition.

> The dependency must be optional, since the integrator provides the Feature
> Service only on the server. The Feature App can determine from its presence
> whether it is currently rendered on the server or on the client.

On the server, the Feature App can use the `rerenderAfter` method to tell the
Async SSR Manager that another render pass is required after the data has been
loaded:

```js
const myFeatureAppDefinition = {
  id: 'acme:my-feature-app',

  optionalDependencies: {
    's2:async-ssr-manager': '^0.1'
  },

  create(env) {
    let data = 'Loading...';

    const fetchData = async () => {
      try {
        const response = await fetch('https://example.com/foo');
        data = await response.text();
      } catch (error) {
        data = error.message;
      }
    };

    const dataPromise = fetchData();
    const asyncSsrManager = env.featureServices['s2:async-ssr-manager'];

    if (asyncSsrManager) {
      asyncSsrManager.rerenderAfter(dataPromise);
    }

    return {
      render() {
        return <div>{data}</div>;
      }
    };
  }
};
```

> The `rerenderAfter` method must be called synchronously during a render pass,
> since the Async SSR Manager synchronously checks after every render pass
> whether there are rerender promises it needs to await, and then do another
> render pass.

### As a Feature Service

If a Feature Service consumer changes shared state of a Feature Service during a
render pass on the server, the Feature Service should trigger a rerender to give
its consumers a chance to update themselves based on the state change:

```js
const myFeatureServiceDefinition = {
  id: 'acme:my-feature-service',

  optionalDependencies: {
    's2:async-ssr-manager': '^0.1'
  },

  create(env) {
    let count = 0;

    const asyncSsrManager = env.featureServices['s2:async-ssr-manager'];

    return {
      '1.0': () => ({
        featureService: {
          // We assume the setCount method is called by consumers while they are
          // rendered on the server.
          setCount(newCount) {
            count = newCount;

            if (asyncSsrManager) {
              asyncSsrManager.rerenderAfter(Promise.resolve());
            }
          },

          getCount() {
            return count;
          }
        }
      })
    };
  }
};
```

### As the Integrator

The Async SSR Manager provides a `renderUntilCompleted` method, that resolves
with an HTML string when all consumers have completed their asynchronous
operations.

On the server, [the integrator must first obtain the Feature
Service][consuming-feature-services]. Together with the `FeatureAppManager` and
the React `FeatureAppLoader` (or `FeatureAppContainer`), the integrator can then
render React Feature Apps that depend on asynchronous operations to fully render
their initial view:

```js
const html = await asyncSsrManager.renderUntilCompleted(() =>
  ReactDOM.renderToString(
    <FeatureAppLoader
      asyncSsrManager={asyncSsrManager}
      featureAppManager={featureAppManager}
      src="https://example.com/some-feature-app.js"
      serverSrc="https://example.com/some-feature-app-node.js"
    />
  )
);
```

> The client-side integrator code should not register the Async SSR Manager, so
> that consumers can determine from its presence whether they are currently
> rendered on the server or on the client.

[async-ssr-manager-api]: /@feature-hub/async-ssr-manager/
[serialized-state-manager-api]: /@feature-hub/serialized-state-manager/
[issue-27]: https://github.com/sinnerschrader/feature-hub/issues/27
[demos-inject-serialized-states-script]:
  https://github.com/sinnerschrader/feature-hub/blob/50a883a744d69f28980e46130bf2a1bdda415216/packages/demos/src/start-server.ts#L26
[demos-extract-serialized-states-script]:
  https://github.com/sinnerschrader/feature-hub/blob/70cdf840eafd5ae7e189758bd5d70003da2fd392/packages/demos/src/server-side-rendering/integrator.tsx#L14-L20
[consuming-feature-services]:
  /docs/guides/integrating-the-feature-hub#consuming-feature-services