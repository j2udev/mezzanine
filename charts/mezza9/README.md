# Mezzanine Helm chart

Deploy **Mezzanine** (the k9s-inspired dashboard) *into* a cluster instead of running it
locally against a kubeconfig (todo #15). In-cluster, both the `@kubernetes/client-node`
calls and the `kubectl`/`helm` shell-outs authenticate via the pod's ServiceAccount token
automatically - no kubeconfig is mounted.

## Install (published OCI chart)

The chart and a multi-arch (linux/amd64 + linux/arm64) image are published to GHCR by the
release pipeline (`.github/workflows/release.yml`, todo #93). Install straight from the OCI
registry - the chart already defaults `image.repository`/`image.tag` to the matching image,
so no `--set` is needed:

```bash
helm install mezza9 oci://ghcr.io/j2udev/charts/mezza9 \
  --namespace mezza9 --create-namespace --version <X.Y.Z>
```

Then reach it (default Service is ClusterIP):

```bash
kubectl -n mezza9 port-forward svc/mezza9 3001:80
# open http://localhost:3001
```

## Install from a local checkout

```bash
helm install mezza9 charts/mezza9 \
  --namespace mezza9 --create-namespace \
  --set image.repository=ghcr.io/j2udev/mezza9 --set image.tag=<tag>
```

## Build & push the image yourself (optional)

The repo `Dockerfile` builds a multi-arch image (it expects `client/dist` to be built first
- an in-image vite build spikes all cores, see CLAUDE.md):

```bash
bash scripts/safe-build.sh                 # refresh client/dist
docker buildx build --platform linux/amd64,linux/arm64 \
  -t <registry>/mezza9:<tag> --push .
```

## RBAC

The dashboard watches **all namespaces** and lists cluster-scoped resources, so the chart
creates a **ClusterRole + ClusterRoleBinding** bound to a dedicated ServiceAccount.

- Default (`rbac.readOnly: false`) grants cluster-wide read **plus** the write verbs the UI
  uses: delete, edit (`kubectl apply`/patch), port-forward, and helm rollback. This is
  effectively cluster-admin - scope it with care.
- `--set rbac.readOnly=true` grants read-only (`get`/`list`/`watch`) access; mutating actions
  in the UI will be denied by the API server.
- `--set rbac.create=false` skips RBAC entirely (bring your own binding).

## Key values

| Key | Default | Description |
|-----|---------|-------------|
| `image.repository` | `mezza9` | **Set this** to your pushed image. |
| `image.tag` | `""` | Falls back to chart `appVersion` (`0.1.0`). |
| `rbac.create` | `true` | Create ClusterRole + binding. |
| `rbac.readOnly` | `false` | Drop write verbs (read-only viewer). |
| `service.type` / `service.port` | `ClusterIP` / `80` | Service exposure. |
| `ingress.enabled` | `false` | Expose via Ingress. |
| `virtualService.enabled` | `false` | Expose via an Istio VirtualService. |
| `virtualService.delegate` | `false` | Render as a *delegate* VS (no hosts/gateways). |
| `virtualService.delegateTo` | `{}` | Make a root VS delegate to another VS instead of routing to the Service. |
| `demo.enabled` | `false` | `MEZZ_DEMO=1` mock cluster (no real RBAC needed). |
| `replicaCount` | `1` | Port-forwards/cache are per-pod in-memory; 1 is recommended. |

See [`values.yaml`](./values.yaml) for the full list (probes, resources, securityContext,
nodeSelector/affinity/tolerations, `extraEnv`).

## Expose via Istio (VirtualService)

If the cluster runs Istio, `virtualService.enabled=true` renders a VirtualService that routes
to the dashboard Service (requires the `networking.istio.io` CRDs). Three shapes are supported:

```bash
# 1. Standard VS bound to a gateway (most common)
helm install mezza9 charts/mezza9 \
  --set virtualService.enabled=true \
  --set 'virtualService.hosts={mezz.example.com}' \
  --set 'virtualService.gateways={istio-system/public-gw}'

# 2. Delegate VS - no hosts/gateways, just the route; referenced by a root VS elsewhere
helm install mezza9 charts/mezza9 \
  --set virtualService.enabled=true --set virtualService.delegate=true

# 3. Root VS that delegates to an existing delegate instead of routing to the Service
helm install mezza9 charts/mezza9 \
  --set virtualService.enabled=true \
  --set virtualService.delegateTo.name=mezz-delegate \
  --set virtualService.delegateTo.namespace=mezz-system
```

By default the generated HTTP route targets `<fullname>.<namespace>.svc.cluster.local` on
`service.port`. Set `virtualService.match` to scope it to a URI prefix, `virtualService.port`
to override the destination port, or `virtualService.http`/`tls`/`tcp` for raw routes. A
delegate VS (case 2) omits `hosts`/`gateways` per the Istio delegation rules.

## Try it without RBAC

```bash
helm install mezza9 charts/mezza9 --set demo.enabled=true \
  --set image.repository=<registry>/mezza9
```

Serves the built-in mock cluster - handy for a UI smoke test before granting real access.
