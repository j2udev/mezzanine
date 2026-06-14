const PORT_BY_CONTAINER = {
  nginx: 80, api: 8080, sidecar: 9091, postgres: 5432, redis: 6379, prometheus: 9090,
  grafana: 3000, controller: 80, coredns: 53, worker: 8080, loki: 3100, payments: 8080,
}

export function getMockResources() {
  const data = {
    pods: [
      { id: 'p1',  name: 'frontend-6d4cf56db6-x2k9p',     namespace: 'default',       status: 'Running',  node: 'worker-1', restarts: 0, ready: '1/1', ip: '10.244.1.10', age: '5d',  containers: ['nginx'],              ownerRef: 'd1', labels: { app: 'frontend' } },
      { id: 'p2',  name: 'frontend-6d4cf56db6-mw7rt',     namespace: 'default',       status: 'Running',  node: 'worker-2', restarts: 0, ready: '1/1', ip: '10.244.2.11', age: '5d',  containers: ['nginx'],              ownerRef: 'd1', labels: { app: 'frontend' } },
      { id: 'p3',  name: 'api-server-5f7d8b9c6-abc12',    namespace: 'default',       status: 'Running',  node: 'worker-1', restarts: 2, ready: '2/2', ip: '10.244.1.12', age: '3d',  containers: ['api', 'sidecar'],    ownerRef: 'd2', labels: { app: 'api' } },
      { id: 'p4',  name: 'api-server-5f7d8b9c6-def34',    namespace: 'default',       status: 'Pending',  node: null,       restarts: 0, ready: '0/2', ip: '',            age: '2h',  containers: ['api', 'sidecar'],    ownerRef: 'd2', labels: { app: 'api' } },
      { id: 'p5',  name: 'postgres-statefulset-0',         namespace: 'database',      status: 'Running',  node: 'worker-3', restarts: 0, ready: '1/1', ip: '10.244.3.5',  age: '14d', containers: ['postgres'],           ownerRef: null, labels: { app: 'postgres' } },
      { id: 'p6',  name: 'redis-master-0',                 namespace: 'cache',         status: 'Running',  node: 'worker-2', restarts: 1, ready: '1/1', ip: '10.244.2.6',  age: '14d', containers: ['redis'],             ownerRef: null, labels: { app: 'redis' } },
      { id: 'p7',  name: 'prometheus-0',                   namespace: 'monitoring',    status: 'Running',  node: 'worker-1', restarts: 0, ready: '1/1', ip: '10.244.1.20', age: '7d',  containers: ['prometheus'],         ownerRef: null, labels: { app: 'prometheus' } },
      { id: 'p8',  name: 'grafana-7d9f5c-xp2kl',          namespace: 'monitoring',    status: 'Running',  node: 'worker-3', restarts: 0, ready: '1/1', ip: '10.244.3.21', age: '7d',  containers: ['grafana'],           ownerRef: 'd3', labels: { app: 'grafana' } },
      { id: 'p9',  name: 'ingress-nginx-controller-abc99', namespace: 'ingress-nginx', status: 'Running',  node: 'worker-1', restarts: 0, ready: '1/1', ip: '10.244.1.30', age: '30d', containers: ['controller'],        ownerRef: 'd4', labels: { app: 'ingress-nginx' } },
      { id: 'p10', name: 'cert-manager-7f9b4-xyz11',       namespace: 'cert-manager',  status: 'Running',  node: 'worker-2', restarts: 0, ready: '1/1', ip: '10.244.2.31', age: '30d', containers: ['controller'],        ownerRef: 'd5', labels: { app: 'cert-manager' } },
      { id: 'p11', name: 'worker-job-batch-k9x2p',         namespace: 'default',       status: 'Failed',   node: 'worker-3', restarts: 5, ready: '0/1', ip: '10.244.3.99', age: '1h',  containers: ['worker'],            ownerRef: null, labels: { job: 'batch' } },
      { id: 'p12', name: 'coredns-5d78c9b647-lm2np',       namespace: 'kube-system',   status: 'Running',  node: 'master-1', restarts: 0, ready: '1/1', ip: '10.244.0.2',  age: '45d', containers: ['coredns'],           ownerRef: null, labels: { app: 'coredns' } },
      { id: 'p13', name: 'coredns-5d78c9b647-np8qr',       namespace: 'kube-system',   status: 'Running',  node: 'master-1', restarts: 0, ready: '1/1', ip: '10.244.0.3',  age: '45d', containers: ['coredns'],           ownerRef: null, labels: { app: 'coredns' } },
      { id: 'p14', name: 'loki-0',                         namespace: 'monitoring',    status: 'Pending',  node: null,       restarts: 0, ready: '0/1', ip: '',            age: '4h',  containers: ['loki'],              ownerRef: null, labels: { app: 'loki' } },
      // Bad-image rollout: deployment still reports 2/2 (old pods serving) but the new pod is stuck.
      { id: 'p15', name: 'payments-6f4cd9b8c7-q8w2e',      namespace: 'default',       status: 'Running',  node: 'worker-1', restarts: 0, ready: '1/1', ip: '10.244.1.41', age: '6d',  containers: ['payments'],          ownerRef: 'd7', labels: { app: 'payments' } },
      { id: 'p16', name: 'payments-6f4cd9b8c7-r3t5y',      namespace: 'default',       status: 'Running',  node: 'worker-2', restarts: 0, ready: '1/1', ip: '10.244.2.42', age: '6d',  containers: ['payments'],          ownerRef: 'd7', labels: { app: 'payments' } },
      { id: 'p17', name: 'payments-7c8ddf9999-zztop',      namespace: 'default',       status: 'ImagePullBackOff', node: 'worker-3', restarts: 0, ready: '0/1', ip: '10.244.3.43', age: '8m', containers: ['payments'],   ownerRef: 'd7', labels: { app: 'payments' } },
    ],
    deployments: [
      { id: 'd1', name: 'frontend',                 namespace: 'default',       ready: '2/2', replicas: 2, readyReplicas: 2, available: 2, upToDate: 2, status: 'Available', age: '5d',  selector: { app: 'frontend' } },
      { id: 'd2', name: 'api-server',               namespace: 'default',       ready: '1/2', replicas: 2, readyReplicas: 1, available: 1, upToDate: 2, status: 'Degraded',  age: '3d',  selector: { app: 'api' } },
      { id: 'd3', name: 'grafana',                  namespace: 'monitoring',    ready: '1/1', replicas: 1, readyReplicas: 1, available: 1, upToDate: 1, status: 'Available', age: '7d',  selector: { app: 'grafana' } },
      { id: 'd4', name: 'ingress-nginx-controller', namespace: 'ingress-nginx', ready: '1/1', replicas: 1, readyReplicas: 1, available: 1, upToDate: 1, status: 'Available', age: '30d', selector: { app: 'ingress-nginx' } },
      { id: 'd5', name: 'cert-manager',             namespace: 'cert-manager',  ready: '1/1', replicas: 1, readyReplicas: 1, available: 1, upToDate: 1, status: 'Available', age: '30d', selector: { app: 'cert-manager' } },
      { id: 'd6', name: 'kube-state-metrics',       namespace: 'monitoring',    ready: '0/1', replicas: 1, readyReplicas: 0, available: 0, upToDate: 1, status: 'Degraded',  age: '7d',  selector: { app: 'kube-state-metrics' } },
      { id: 'd7', name: 'payments',                 namespace: 'default',       ready: '2/2', replicas: 2, readyReplicas: 2, available: 2, upToDate: 1, status: 'Available', age: '6d',  selector: { app: 'payments' } },
    ],
    services: [
      { id: 's1', name: 'frontend',     namespace: 'default',       type: 'LoadBalancer', clusterIP: '10.96.0.100', externalIP: '203.0.113.10', ports: '80/TCP, 443/TCP',  age: '5d',  status: 'Active', selector: { app: 'frontend' } },
      { id: 's2', name: 'api-service',  namespace: 'default',       type: 'ClusterIP',    clusterIP: '10.96.0.101', externalIP: '',             ports: '8080/TCP',         age: '3d',  status: 'Active', selector: { app: 'api' } },
      { id: 's3', name: 'postgres',     namespace: 'database',      type: 'ClusterIP',    clusterIP: '10.96.0.102', externalIP: '',             ports: '5432/TCP',         age: '14d', status: 'Active', selector: { app: 'postgres' } },
      { id: 's4', name: 'redis-master', namespace: 'cache',         type: 'ClusterIP',    clusterIP: '10.96.0.103', externalIP: '',             ports: '6379/TCP',         age: '14d', status: 'Active', selector: { app: 'redis' } },
      { id: 's5', name: 'prometheus',   namespace: 'monitoring',    type: 'ClusterIP',    clusterIP: '10.96.0.104', externalIP: '',             ports: '9090/TCP',         age: '7d',  status: 'Active', selector: { app: 'prometheus' } },
      { id: 's6', name: 'grafana',      namespace: 'monitoring',    type: 'NodePort',     clusterIP: '10.96.0.105', externalIP: '',             ports: '3000:30000/TCP',   age: '7d',  status: 'Active', selector: { app: 'grafana' } },
      { id: 's7', name: 'kubernetes',   namespace: 'default',       type: 'ClusterIP',    clusterIP: '10.96.0.1',   externalIP: '',             ports: '443/TCP',          age: '45d', status: 'Active', selector: {} },
    ],
    statefulsets: [
      { id: 'ss1', name: 'postgres',    namespace: 'database',   ready: '1/1', replicas: 1, readyReplicas: 1, status: 'Available' },
      { id: 'ss2', name: 'redis-master',namespace: 'cache',      ready: '1/1', replicas: 1, readyReplicas: 1, status: 'Available' },
      { id: 'ss3', name: 'zookeeper',   namespace: 'monitoring', ready: '3/3', replicas: 3, readyReplicas: 3, status: 'Available' },
      { id: 'ss4', name: 'kafka-broker',namespace: 'default',    ready: '2/3', replicas: 3, readyReplicas: 2, status: 'Degraded'  },
    ],
    daemonsets: [
      { id: 'ds1', name: 'fluentd-logging', namespace: 'kube-system', desired: 4, ready: 4, status: 'Available' },
      { id: 'ds2', name: 'node-exporter',   namespace: 'monitoring',  desired: 4, ready: 4, status: 'Available' },
      { id: 'ds3', name: 'calico-node',     namespace: 'kube-system', desired: 4, ready: 3, status: 'Degraded'  },
    ],
    jobs: [
      { id: 'j1', name: 'db-migrate-v2-xr9k2',      namespace: 'database', status: 'Complete', completions: '1/1', duration: '45s'  },
      { id: 'j2', name: 'import-data-abc12',         namespace: 'default',  status: 'Running',  completions: '0/1', duration: '2m'   },
      { id: 'j3', name: 'cleanup-old-logs-xyz99',    namespace: 'default',  status: 'Failed',   completions: '0/3', duration: '8m'   },
      { id: 'j4', name: 'backup-mysql-20260611',     namespace: 'database', status: 'Complete', completions: '1/1', duration: '3m'   },
    ],
    cronjobs: [
      { id: 'cj1', name: 'db-backup',      namespace: 'database',   schedule: '0 */6 * * *',  active: 0, lastSchedule: '2h',   status: 'Active'    },
      { id: 'cj2', name: 'cleanup-logs',   namespace: 'kube-system',schedule: '0 2 * * *',     active: 0, lastSchedule: '22h',  status: 'Active'    },
      { id: 'cj3', name: 'health-report',  namespace: 'monitoring', schedule: '*/30 * * * *',  active: 1, lastSchedule: '12m',  status: 'Active'    },
      { id: 'cj4', name: 'db-vacuum',      namespace: 'database',   schedule: '0 0 * * 0',     active: 0, lastSchedule: 'never',status: 'Suspended' },
    ],
    ingresses: [
      { id: 'i1', name: 'frontend-ingress', namespace: 'default',    hosts: 'frontend.example.com', address: '203.0.113.1', ports: '80, 443', status: 'Active' },
      { id: 'i2', name: 'api-ingress',      namespace: 'default',    hosts: 'api.example.com',      address: '203.0.113.1', ports: '80, 443', status: 'Active' },
      { id: 'i3', name: 'grafana-ingress',  namespace: 'monitoring', hosts: 'grafana.example.com',  address: '203.0.113.1', ports: '80',      status: 'Active' },
    ],
    configmaps: [
      { id: 'cm1', name: 'app-config',          namespace: 'default',       keys: 8,  age: '14d', status: 'Active' },
      { id: 'cm2', name: 'nginx-config',         namespace: 'ingress-nginx', keys: 5,  age: '30d', status: 'Active' },
      { id: 'cm3', name: 'prometheus-rules',     namespace: 'monitoring',    keys: 12, age: '7d',  status: 'Active' },
      { id: 'cm4', name: 'coredns',              namespace: 'kube-system',   keys: 2,  age: '45d', status: 'Active' },
      { id: 'cm5', name: 'grafana-dashboards',   namespace: 'monitoring',    keys: 4,  age: '7d',  status: 'Active' },
      { id: 'cm6', name: 'kube-proxy',           namespace: 'kube-system',   keys: 2,  age: '45d', status: 'Active' },
    ],
    secrets: [
      { id: 'sec1', name: 'db-credentials',    namespace: 'database',   type: 'Opaque',                          keys: 3, status: 'Active' },
      { id: 'sec2', name: 'tls-certificate',   namespace: 'default',    type: 'kubernetes.io/tls',               keys: 2, status: 'Active' },
      { id: 'sec3', name: 'docker-registry',   namespace: 'default',    type: 'kubernetes.io/dockerconfigjson',  keys: 1, status: 'Active' },
      { id: 'sec4', name: 'alertmanager-cfg',  namespace: 'monitoring', type: 'Opaque',                          keys: 5, status: 'Active' },
      { id: 'sec5', name: 'cert-manager-webhook-ca', namespace: 'cert-manager', type: 'Opaque',                  keys: 3, status: 'Active' },
    ],
    pvcs: [
      { id: 'pvc1', name: 'postgres-data',    namespace: 'database',   status: 'Bound',   volume: 'pv-postgres',    capacity: '50Gi'  },
      { id: 'pvc2', name: 'redis-data',       namespace: 'cache',      status: 'Bound',   volume: 'pv-redis',       capacity: '10Gi'  },
      { id: 'pvc3', name: 'prometheus-data',  namespace: 'monitoring', status: 'Bound',   volume: 'pv-prometheus',  capacity: '100Gi' },
      { id: 'pvc4', name: 'grafana-data',     namespace: 'monitoring', status: 'Pending', volume: '',               capacity: '5Gi'   },
    ],
    pvs: [
      { id: 'pv1', name: 'pv-postgres',   namespace: '', status: 'Bound',    claim: 'database/postgres-data',   storageClass: 'standard',  capacity: '50Gi'  },
      { id: 'pv2', name: 'pv-redis',      namespace: '', status: 'Bound',    claim: 'cache/redis-data',         storageClass: 'standard',  capacity: '10Gi'  },
      { id: 'pv3', name: 'pv-prometheus', namespace: '', status: 'Bound',    claim: 'monitoring/prometheus-data',storageClass: 'fast-ssd',  capacity: '100Gi' },
      { id: 'pv4', name: 'pv-orphaned',   namespace: '', status: 'Released', claim: '',                         storageClass: 'standard',  capacity: '5Gi'   },
    ],
    nodes: [
      { id: 'n1', name: 'master-1', namespace: '', status: 'Ready',    roles: 'control-plane', version: 'v1.30.1' },
      { id: 'n2', name: 'worker-1', namespace: '', status: 'Ready',    roles: 'worker',        version: 'v1.30.1' },
      { id: 'n3', name: 'worker-2', namespace: '', status: 'Ready',    roles: 'worker',        version: 'v1.30.1' },
      { id: 'n4', name: 'worker-3', namespace: '', status: 'NotReady', roles: 'worker',        version: 'v1.30.1' },
    ],
    namespaces: [
      { id: 'ns1', name: 'default',       namespace: '', status: 'Active' },
      { id: 'ns2', name: 'kube-system',   namespace: '', status: 'Active' },
      { id: 'ns3', name: 'kube-public',   namespace: '', status: 'Active' },
      { id: 'ns4', name: 'monitoring',    namespace: '', status: 'Active' },
      { id: 'ns5', name: 'database',      namespace: '', status: 'Active' },
      { id: 'ns6', name: 'cache',         namespace: '', status: 'Active' },
      { id: 'ns7', name: 'ingress-nginx', namespace: '', status: 'Active' },
      { id: 'ns8', name: 'cert-manager',  namespace: '', status: 'Active' },
    ],
    crds: [
      { id: 'crd1', name: 'certificates.cert-manager.io',          namespace: '', group: 'cert-manager.io',        version: 'v1', plural: 'certificates',          kind: 'Certificate',          namespaced: true,  status: 'Active' },
      { id: 'crd2', name: 'certificaterequests.cert-manager.io',   namespace: '', group: 'cert-manager.io',        version: 'v1', plural: 'certificaterequests',   kind: 'CertificateRequest',   namespaced: true,  status: 'Active' },
      { id: 'crd3', name: 'clusterissuers.cert-manager.io',        namespace: '', group: 'cert-manager.io',        version: 'v1', plural: 'clusterissuers',        kind: 'ClusterIssuer',        namespaced: false, status: 'Active' },
      { id: 'crd4', name: 'prometheuses.monitoring.coreos.com',    namespace: '', group: 'monitoring.coreos.com',  version: 'v1', plural: 'prometheuses',          kind: 'Prometheus',           namespaced: true,  status: 'Active' },
      { id: 'crd5', name: 'servicemonitors.monitoring.coreos.com', namespace: '', group: 'monitoring.coreos.com',  version: 'v1', plural: 'servicemonitors',       kind: 'ServiceMonitor',       namespaced: true,  status: 'Active' },
    ],
    helmreleases: [
      { id: 'hr1', name: 'prometheus',    namespace: 'monitoring',    chart: 'kube-prometheus-stack-45.0.0', version: 3, status: 'Deployed'   },
      { id: 'hr2', name: 'grafana',       namespace: 'monitoring',    chart: 'grafana-6.50.7',               version: 2, status: 'Deployed'   },
      { id: 'hr3', name: 'cert-manager',  namespace: 'cert-manager',  chart: 'cert-manager-v1.12.0',         version: 5, status: 'Deployed'   },
      { id: 'hr4', name: 'ingress-nginx', namespace: 'ingress-nginx', chart: 'ingress-nginx-4.5.2',          version: 1, status: 'Deployed'   },
      { id: 'hr5', name: 'loki-stack',    namespace: 'monitoring',    chart: 'loki-stack-2.9.11',            version: 1, status: 'Failed'     },
    ],
    replicasets: [
      { id: 'rs1', name: 'frontend-6d4cf56db6',     namespace: 'default',       ready: '2/2', replicas: 2, readyReplicas: 2, status: 'Available', age: '5d' },
      { id: 'rs2', name: 'api-server-5f7d8b9c6',    namespace: 'default',       ready: '1/2', replicas: 2, readyReplicas: 1, status: 'Degraded',  age: '3d' },
      { id: 'rs3', name: 'grafana-7d9f5c',           namespace: 'monitoring',    ready: '1/1', replicas: 1, readyReplicas: 1, status: 'Available', age: '7d' },
      { id: 'rs4', name: 'kube-state-metrics-abc12', namespace: 'monitoring',    ready: '0/1', replicas: 1, readyReplicas: 0, status: 'Degraded',  age: '7d' },
    ],
    hpa: [
      { id: 'hpa1', name: 'frontend-hpa',   namespace: 'default',    targetRef: 'Deployment/frontend',   minReplicas: 2, maxReplicas: 10, currentReplicas: 2, status: 'Active', age: '5d' },
      { id: 'hpa2', name: 'api-server-hpa', namespace: 'default',    targetRef: 'Deployment/api-server', minReplicas: 2, maxReplicas: 8,  currentReplicas: 2, status: 'Active', age: '3d' },
      { id: 'hpa3', name: 'worker-hpa',     namespace: 'monitoring', targetRef: 'Deployment/grafana',    minReplicas: 1, maxReplicas: 4,  currentReplicas: 1, status: 'Active', age: '7d' },
    ],
    pdb: [
      { id: 'pdb1', name: 'frontend-pdb',  namespace: 'default',    minAvailable: '1', maxUnavailable: '', allowed: 1, status: 'Active',   age: '5d' },
      { id: 'pdb2', name: 'api-pdb',       namespace: 'default',    minAvailable: '1', maxUnavailable: '', allowed: 0, status: 'Blocking', age: '3d' },
      { id: 'pdb3', name: 'postgres-pdb',  namespace: 'database',   minAvailable: '',  maxUnavailable: '0', allowed: 1, status: 'Active',  age: '14d' },
    ],
    networkpolicies: [
      { id: 'np1', name: 'default-deny-all',       namespace: 'default',    ingress: 0, egress: 0, status: 'Active', age: '30d' },
      { id: 'np2', name: 'allow-frontend-to-api',  namespace: 'default',    ingress: 1, egress: 1, status: 'Active', age: '5d'  },
      { id: 'np3', name: 'allow-monitoring',       namespace: 'monitoring', ingress: 2, egress: 1, status: 'Active', age: '7d'  },
      { id: 'np4', name: 'restrict-database',      namespace: 'database',   ingress: 1, egress: 0, status: 'Active', age: '14d' },
    ],
    serviceaccounts: [
      { id: 'sa1', name: 'default',             namespace: 'default',       secrets: 1, status: 'Active', age: '45d' },
      { id: 'sa2', name: 'cert-manager',        namespace: 'cert-manager',  secrets: 1, status: 'Active', age: '30d' },
      { id: 'sa3', name: 'prometheus',          namespace: 'monitoring',    secrets: 1, status: 'Active', age: '7d'  },
      { id: 'sa4', name: 'grafana',             namespace: 'monitoring',    secrets: 1, status: 'Active', age: '7d'  },
      { id: 'sa5', name: 'ingress-nginx',       namespace: 'ingress-nginx', secrets: 1, status: 'Active', age: '30d' },
    ],
    resourcequotas: [
      { id: 'rq1', name: 'default-quota',   namespace: 'default',    cpu: '800m/4',    memory: '1.5Gi/8Gi',  pods: '12/50', status: 'Active', age: '45d' },
      { id: 'rq2', name: 'monitoring-quota',namespace: 'monitoring', cpu: '2/8',       memory: '4Gi/16Gi',   pods: '8/30',  status: 'Active', age: '7d'  },
      { id: 'rq3', name: 'database-quota',  namespace: 'database',   cpu: '500m/2',    memory: '2Gi/4Gi',    pods: '3/10',  status: 'Active', age: '14d' },
    ],
    storageclasses: [
      { id: 'sc1', name: 'standard',      namespace: '', provisioner: 'rancher.io/local-path', reclaim: 'Delete',  bindingMode: 'WaitForFirstConsumer', status: 'Active' },
      { id: 'sc2', name: 'fast-ssd',      namespace: '', provisioner: 'ebs.csi.aws.com',       reclaim: 'Delete',  bindingMode: 'WaitForFirstConsumer', status: 'Active' },
      { id: 'sc3', name: 'retain-backup', namespace: '', provisioner: 'ebs.csi.aws.com',       reclaim: 'Retain',  bindingMode: 'Immediate',            status: 'Active' },
    ],
    roles: [
      { id: 'role1', name: 'pod-reader',       namespace: 'default',    rules: 1, status: 'Active', age: '30d' },
      { id: 'role2', name: 'deployment-admin', namespace: 'default',    rules: 3, status: 'Active', age: '14d' },
      { id: 'role3', name: 'log-reader',       namespace: 'monitoring', rules: 2, status: 'Active', age: '7d'  },
    ],
    clusterroles: [
      { id: 'cr1', name: 'cluster-admin',       namespace: '', rules: 1,  status: 'Active', age: '45d' },
      { id: 'cr2', name: 'view',                namespace: '', rules: 8,  status: 'Active', age: '45d' },
      { id: 'cr3', name: 'edit',                namespace: '', rules: 14, status: 'Active', age: '45d' },
      { id: 'cr4', name: 'cert-manager-controller', namespace: '', rules: 12, status: 'Active', age: '30d' },
    ],
    rolebindings: [
      { id: 'rb1', name: 'admin-binding',   namespace: 'default',    roleRef: 'Role/deployment-admin', subjects: 2, status: 'Active', age: '14d' },
      { id: 'rb2', name: 'view-binding',    namespace: 'monitoring', roleRef: 'Role/log-reader',       subjects: 1, status: 'Active', age: '7d'  },
    ],
    clusterrolebindings: [
      { id: 'crb1', name: 'cluster-admin-binding', namespace: '', roleRef: 'ClusterRole/cluster-admin', subjects: 1, status: 'Active', age: '45d' },
      { id: 'crb2', name: 'cert-manager-binding',  namespace: '', roleRef: 'ClusterRole/cert-manager-controller', subjects: 1, status: 'Active', age: '30d' },
    ],
    events: [
      { id: 'ev1',  name: 'frontend.17a1b', namespace: 'default',    type: 'Normal',  reason: 'Scheduled',      message: 'Successfully assigned default/frontend-6d4cf56db6-x2k9p to worker-1', object: 'Pod/frontend-6d4cf56db6-x2k9p', count: 1, status: 'Normal',  age: '5d'  },
      { id: 'ev2',  name: 'api-server.17c2', namespace: 'default',   type: 'Warning', reason: 'BackOff',         message: 'Back-off restarting failed container api in pod api-server-5f7d8b9c6-abc12',  object: 'Pod/api-server-5f7d8b9c6-abc12', count: 14, status: 'Warning', age: '3d'  },
      { id: 'ev3',  name: 'postgres.16aa1', namespace: 'database',   type: 'Normal',  reason: 'Pulled',          message: 'Successfully pulled image "postgres:15" in 2.3s',                    object: 'Pod/postgres-statefulset-0', count: 1, status: 'Normal',  age: '14d' },
      { id: 'ev4',  name: 'loki.17e3c',     namespace: 'monitoring', type: 'Warning', reason: 'FailedScheduling',message: '0/4 nodes are available: 3 Insufficient memory.',                    object: 'Pod/loki-0',                 count: 8, status: 'Warning', age: '4h'  },
      { id: 'ev5',  name: 'calico.17f1a',   namespace: 'kube-system',type: 'Warning', reason: 'NodeNotReady',   message: 'Node worker-3 status is now: NodeNotReady',                           object: 'Node/worker-3',              count: 3, status: 'Warning', age: '6h'  },
      { id: 'ev6',  name: 'dep.17g2b',      namespace: 'default',    type: 'Normal',  reason: 'ScalingReplicaSet', message: 'Scaled up replica set frontend-6d4cf56db6 to 2',                 object: 'Deployment/frontend',        count: 1, status: 'Normal',  age: '5d'  },
    ],
  }

  // Enrich with owner jump targets + container ports so demo matches the live shape.
  const depById = Object.fromEntries(data.deployments.map(d => [d.id, d]))
  for (const p of data.pods) {
    const dep = p.ownerRef && depById[p.ownerRef]
    if (dep) {
      p.owner = { resource: 'deployments', name: dep.name, namespace: dep.namespace }
    } else {
      const ss = data.statefulsets.find(s => s.namespace === p.namespace && p.name.startsWith(s.name + '-'))
      if (ss) p.owner = { resource: 'statefulsets', name: ss.name, namespace: ss.namespace }
    }
    p.containerPorts = [...new Set((p.containers || []).map(c => PORT_BY_CONTAINER[c]).filter(Boolean))]
  }
  for (const d of data.deployments) {
    d.containerPorts = data.pods.find(p => p.ownerRef === d.id)?.containerPorts || []
  }
  for (const s of data.statefulsets) {
    s.containerPorts = data.pods.find(p => p.namespace === s.namespace && p.name.startsWith(s.name + '-'))?.containerPorts || []
  }

  // Every resource type carries an AGE column; fill any demo rows that don't
  // already specify one with a plausible, deterministic value (stable per id).
  for (const list of Object.values(data)) {
    if (Array.isArray(list)) list.forEach(fillAge)
  }

  return data
}

const AGE_POOL = ['5m', '12m', '1h', '4h', '8h', '1d', '3d', '5d', '7d', '14d', '30d', '45d']
function fillAge(item) {
  if (item && item.age == null) {
    const h = [...(item.id || item.name || '')].reduce((a, c) => a + c.charCodeAt(0), 0)
    item.age = AGE_POOL[h % AGE_POOL.length]
  }
}

export function getMockCrdResources(group, version, plural) {
  const list = mockCrdResources(group, plural)
  list.forEach(fillAge)
  return list
}

function mockCrdResources(group, plural) {
  if (group === 'cert-manager.io' && plural === 'certificates') {
    return [
      { id: 'cr1', name: 'frontend-tls',    namespace: 'default',    status: 'Ready'   },
      { id: 'cr2', name: 'api-tls',         namespace: 'default',    status: 'Ready'   },
      { id: 'cr3', name: 'grafana-tls',     namespace: 'monitoring', status: 'Pending' },
    ]
  }
  if (group === 'cert-manager.io' && plural === 'certificaterequests') {
    return [
      { id: 'cr4', name: 'frontend-tls-1234', namespace: 'default', status: 'Ready' },
    ]
  }
  if (group === 'cert-manager.io' && plural === 'clusterissuers') {
    return [
      { id: 'cr5', name: 'letsencrypt-prod',    namespace: '', status: 'Ready' },
      { id: 'cr6', name: 'letsencrypt-staging', namespace: '', status: 'Ready' },
    ]
  }
  if (group === 'monitoring.coreos.com' && plural === 'prometheuses') {
    return [
      { id: 'cr7', name: 'kube-prometheus', namespace: 'monitoring', status: 'Running' },
    ]
  }
  if (group === 'monitoring.coreos.com' && plural === 'servicemonitors') {
    return [
      { id: 'cr8',  name: 'prometheus',    namespace: 'monitoring', status: 'Active' },
      { id: 'cr9',  name: 'grafana',       namespace: 'monitoring', status: 'Active' },
      { id: 'cr10', name: 'node-exporter', namespace: 'monitoring', status: 'Active' },
    ]
  }
  return []
}

export function getMockLogs(namespace, podName) {
  const lines = [
    `[2026-06-11T16:00:01Z] INFO  Starting ${podName}`,
    `[2026-06-11T16:00:01Z] INFO  Loading configuration from /etc/config`,
    `[2026-06-11T16:00:02Z] INFO  Connecting to database...`,
    `[2026-06-11T16:00:02Z] INFO  Database connection established`,
    `[2026-06-11T16:00:02Z] INFO  Server listening on :8080`,
    `[2026-06-11T16:00:10Z] INFO  GET /healthz 200 1ms`,
    `[2026-06-11T16:00:20Z] INFO  GET /healthz 200 1ms`,
    `[2026-06-11T16:00:30Z] INFO  GET /api/v1/users 200 12ms`,
    `[2026-06-11T16:00:31Z] INFO  POST /api/v1/events 201 8ms`,
    `[2026-06-11T16:00:40Z] INFO  GET /healthz 200 1ms`,
    `[2026-06-11T16:01:00Z] INFO  GET /metrics 200 3ms`,
    `[2026-06-11T16:01:10Z] WARN  Slow query detected: 230ms (threshold: 200ms)`,
    `[2026-06-11T16:01:15Z] INFO  GET /api/v1/items 200 18ms`,
    `[2026-06-11T16:01:30Z] INFO  Cache miss for key: session:abc123`,
    `[2026-06-11T16:01:45Z] INFO  GET /healthz 200 1ms`,
    `[2026-06-11T16:02:00Z] INFO  Scheduled job 'cleanup' started`,
    `[2026-06-11T16:02:01Z] INFO  Scheduled job 'cleanup' completed in 340ms`,
    `[2026-06-11T16:02:15Z] ERROR connection reset by peer`,
    `[2026-06-11T16:02:16Z] INFO  Reconnecting...`,
    `[2026-06-11T16:02:16Z] INFO  Connection restored`,
    `[2026-06-11T16:03:00Z] INFO  GET /api/v1/deployments 200 9ms`,
    `[2026-06-11T16:03:12Z] INFO  POST /api/v1/scale 200 44ms`,
    `[2026-06-11T16:03:30Z] INFO  GET /healthz 200 1ms`,
  ]
  return lines.join('\n')
}

export function getMockDescribe(resource, name, namespace) {
  const ns = namespace && namespace !== '_' ? namespace : 'default'
  const ts = '2026-06-07T10:00:00Z'
  if (resource === 'pods') {
    return `Name:             ${name}
Namespace:        ${ns}
Priority:         0
Service Account:  default
Node:             worker-1/10.0.0.1
Start Time:       Fri, 07 Jun 2026 10:00:00 +0000
Labels:           app=${name.split('-')[0]}
Annotations:      <none>
Status:           Running
IP:               10.244.1.10
IPs:
  IP:           10.244.1.10
Containers:
  ${name.split('-')[0]}:
    Container ID:   containerd://abc123def456
    Image:          nginx:1.25
    Image ID:       docker.io/library/nginx@sha256:abc123
    Port:           80/TCP
    Host Port:      0/TCP
    State:          Running
      Started:      Fri, 07 Jun 2026 10:00:02 +0000
    Ready:          True
    Restart Count:  0
    Limits:
      cpu:     500m
      memory:  256Mi
    Requests:
      cpu:     100m
      memory:  128Mi
    Liveness:   http-get http://:8080/healthz delay=10s timeout=1s period=10s #success=1 #failure=3
    Readiness:  http-get http://:8080/ready delay=5s timeout=1s period=5s #success=1 #failure=3
    Environment:
      POD_NAME:       ${name} (v1:metadata.name)
      POD_NAMESPACE:  ${ns} (v1:metadata.namespace)
    Mounts:
      /var/run/secrets/kubernetes.io/serviceaccount from kube-api-access-xxxxx (ro)
Conditions:
  Type              Status
  Initialized       True
  Ready             True
  ContainersReady   True
  PodScheduled      True
Volumes:
  kube-api-access-xxxxx:
    Type:                    Projected (a volume that contains injected data from multiple sources)
    TokenExpirationSeconds:  3607
QoS Class:                   Burstable
Node-Selectors:               <none>
Tolerations:                  node.kubernetes.io/not-ready:NoExecute op=Exists for 300s
                              node.kubernetes.io/unreachable:NoExecute op=Exists for 300s
Events:
  Type    Reason     Age   From               Message
  ----    ------     ----  ----               -------
  Normal  Scheduled  5d    default-scheduler  Successfully assigned ${ns}/${name} to worker-1
  Normal  Pulling    5d    kubelet            Pulling image "nginx:1.25"
  Normal  Pulled     5d    kubelet            Successfully pulled image "nginx:1.25" in 2.3s
  Normal  Created    5d    kubelet            Created container ${name.split('-')[0]}
  Normal  Started    5d    kubelet            Started container ${name.split('-')[0]}`
  }
  if (resource === 'deployments') {
    return `Name:                   ${name}
Namespace:              ${ns}
CreationTimestamp:      ${ts}
Labels:                 app=${name}
Annotations:            deployment.kubernetes.io/revision: 3
Selector:               app=${name}
Replicas:               3 desired | 3 updated | 3 total | 3 available | 0 unavailable
StrategyType:           RollingUpdate
MinReadySeconds:        0
RollingUpdateStrategy:  25% max unavailable, 25% max surge
Pod Template:
  Labels:  app=${name}
  Containers:
   ${name}:
    Image:      nginx:1.25
    Port:       80/TCP
    Host Port:  0/TCP
    Limits:
      cpu:     500m
      memory:  256Mi
    Requests:
      cpu:     100m
      memory:  128Mi
    Liveness:   http-get http://:8080/healthz delay=10s
    Readiness:  http-get http://:8080/ready delay=5s
    Environment:  <none>
    Mounts:       <none>
  Volumes:        <none>
Conditions:
  Type           Status  Reason
  ----           ------  ------
  Progressing    True    NewReplicaSetAvailable
  Available      True    MinimumReplicasAvailable
OldReplicaSets:  <none>
NewReplicaSet:   ${name}-6d4cf56db6 (3/3 replicas created)
Events:
  Type    Reason             Age   From                   Message
  ----    ------             ----  ----                   -------
  Normal  ScalingReplicaSet  5d    deployment-controller  Scaled up replica set ${name}-6d4cf56db6 to 3`
  }
  return `Name:         ${name}
Namespace:    ${ns}
Labels:       app=${name}
Annotations:  <none>
Status:       Active

Events:       <none>`
}

export function getMockYaml(resource, name, namespace) {
  const ns = namespace && namespace !== '_' ? namespace : 'default'
  const uid = 'mock-' + Math.random().toString(36).slice(2, 10)
  if (resource === 'pods') {
    return `apiVersion: v1
kind: Pod
metadata:
  name: ${name}
  namespace: ${ns}
  uid: ${uid}
  resourceVersion: "123456"
  creationTimestamp: "2026-06-07T10:00:00Z"
  labels:
    app: ${name.split('-')[0]}
  annotations: {}
spec:
  nodeName: worker-1
  serviceAccountName: default
  restartPolicy: Always
  containers:
  - name: ${name.split('-')[0]}
    image: nginx:1.25
    ports:
    - containerPort: 80
      protocol: TCP
    resources:
      limits:
        cpu: 500m
        memory: 256Mi
      requests:
        cpu: 100m
        memory: 128Mi
    livenessProbe:
      httpGet:
        path: /healthz
        port: 8080
      initialDelaySeconds: 10
    readinessProbe:
      httpGet:
        path: /ready
        port: 8080
      initialDelaySeconds: 5
    env:
    - name: POD_NAME
      valueFrom:
        fieldRef:
          fieldPath: metadata.name
    - name: POD_NAMESPACE
      valueFrom:
        fieldRef:
          fieldPath: metadata.namespace
status:
  phase: Running
  podIP: 10.244.1.10
  conditions:
  - type: Ready
    status: "True"
  containerStatuses:
  - name: ${name.split('-')[0]}
    ready: true
    restartCount: 0
    state:
      running:
        startedAt: "2026-06-07T10:00:02Z"`
  }
  if (resource === 'deployments') {
    return `apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: ${ns}
  uid: ${uid}
  resourceVersion: "234567"
  creationTimestamp: "2026-06-07T10:00:00Z"
  labels:
    app: ${name}
  annotations:
    deployment.kubernetes.io/revision: "3"
spec:
  replicas: 3
  selector:
    matchLabels:
      app: ${name}
  strategy:
    type: RollingUpdate
    rollingUpdate:
      maxSurge: 25%
      maxUnavailable: 25%
  template:
    metadata:
      labels:
        app: ${name}
    spec:
      containers:
      - name: ${name}
        image: nginx:1.25
        ports:
        - containerPort: 80
          protocol: TCP
        resources:
          limits:
            cpu: 500m
            memory: 256Mi
          requests:
            cpu: 100m
            memory: 128Mi
status:
  replicas: 3
  readyReplicas: 3
  availableReplicas: 3
  updatedReplicas: 3`
  }
  return `apiVersion: v1
kind: ${resource.slice(0, -1)}
metadata:
  name: ${name}
  namespace: ${ns}
  uid: ${uid}
  resourceVersion: "345678"
  creationTimestamp: "2026-06-07T10:00:00Z"
  labels:
    app: ${name}
status:
  phase: Active`
}

export function getMockHelmValues(name) {
  return `# User-supplied values for ${name}
replicaCount: 2
image:
  repository: nginx
  pullPolicy: IfNotPresent
  tag: "1.25"
service:
  type: ClusterIP
  port: 80
ingress:
  enabled: true
  hosts:
    - host: ${name}.example.com
      paths:
        - path: /
          pathType: Prefix
resources:
  limits:
    cpu: 500m
    memory: 256Mi
  requests:
    cpu: 100m
    memory: 128Mi
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
`
}

export function getMockHelmAllValues(name) {
  return `# Computed values for ${name} (user + chart defaults)
replicaCount: 2
image:
  repository: nginx
  pullPolicy: IfNotPresent
  tag: "1.25"
nameOverride: ""
fullnameOverride: ""
serviceAccount:
  create: true
  automount: true
  annotations: {}
  name: ""
podAnnotations: {}
podLabels: {}
podSecurityContext: {}
securityContext: {}
service:
  type: ClusterIP
  port: 80
ingress:
  enabled: true
  className: "nginx"
  annotations:
    kubernetes.io/ingress.class: nginx
    cert-manager.io/cluster-issuer: letsencrypt-prod
  hosts:
    - host: ${name}.example.com
      paths:
        - path: /
          pathType: Prefix
  tls:
    - secretName: ${name}-tls
      hosts:
        - ${name}.example.com
resources:
  limits:
    cpu: 500m
    memory: 256Mi
  requests:
    cpu: 100m
    memory: 128Mi
autoscaling:
  enabled: true
  minReplicas: 2
  maxReplicas: 10
  targetCPUUtilizationPercentage: 80
volumes: []
volumeMounts: []
nodeSelector: {}
tolerations: []
affinity: {}
`
}

export function getMockHelmManifest(name, namespace) {
  return `---
# Source: ${name}/templates/serviceaccount.yaml
apiVersion: v1
kind: ServiceAccount
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    helm.sh/chart: ${name}-1.0.0
    app.kubernetes.io/name: ${name}
    app.kubernetes.io/instance: ${name}
---
# Source: ${name}/templates/service.yaml
apiVersion: v1
kind: Service
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    helm.sh/chart: ${name}-1.0.0
    app.kubernetes.io/name: ${name}
spec:
  type: ClusterIP
  ports:
    - port: 80
      targetPort: http
      protocol: TCP
      name: http
  selector:
    app.kubernetes.io/name: ${name}
---
# Source: ${name}/templates/deployment.yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: ${name}
  namespace: ${namespace}
  labels:
    helm.sh/chart: ${name}-1.0.0
    app.kubernetes.io/name: ${name}
spec:
  replicas: 2
  selector:
    matchLabels:
      app.kubernetes.io/name: ${name}
  template:
    metadata:
      labels:
        app.kubernetes.io/name: ${name}
    spec:
      serviceAccountName: ${name}
      containers:
        - name: ${name}
          image: "nginx:1.25"
          ports:
            - name: http
              containerPort: 80
              protocol: TCP
          resources:
            limits:
              cpu: 500m
              memory: 256Mi
            requests:
              cpu: 100m
              memory: 128Mi
`
}

export function getMockHelmHistory(name) {
  return [
    { revision: 5, updated: '2026-06-10 14:32:11', status: 'deployed',   chart: `${name}-1.2.3`, appVersion: '1.25', description: 'Upgrade complete' },
    { revision: 4, updated: '2026-06-08 09:15:44', status: 'superseded', chart: `${name}-1.2.2`, appVersion: '1.24', description: 'Upgrade complete' },
    { revision: 3, updated: '2026-06-05 16:00:00', status: 'superseded', chart: `${name}-1.2.1`, appVersion: '1.24', description: 'Rollback to 2' },
    { revision: 2, updated: '2026-06-01 10:30:00', status: 'superseded', chart: `${name}-1.2.1`, appVersion: '1.23', description: 'Upgrade complete' },
    { revision: 1, updated: '2026-05-20 08:00:00', status: 'superseded', chart: `${name}-1.2.0`, appVersion: '1.23', description: 'Install complete' },
  ]
}

export function getMockHelmNotes(name) {
  return `NOTES:
1. Get the application URL by running these commands:
  export POD_NAME=$(kubectl get pods --namespace {{ .Release.Namespace }} -l "app.kubernetes.io/name=${name}" -o jsonpath="{.items[0].metadata.name}")
  export CONTAINER_PORT=$(kubectl get pod --namespace {{ .Release.Namespace }} $POD_NAME -o jsonpath="{.spec.containers[0].ports[0].containerPort}")
  echo "Visit http://127.0.0.1:8080 to use your application"
  kubectl --namespace {{ .Release.Namespace }} port-forward $POD_NAME 8080:$CONTAINER_PORT

2. The ${name} release was deployed successfully to namespace {{ .Release.Namespace }}.

3. Chart version: 1.2.3
   App version:   1.25
`
}

