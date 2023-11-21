const { ApiPromise, WsProvider } = require('@polkadot/api');
const { hexToString } = require('@polkadot/util');

async function getAllBalances(api) {

  // Get the list of all account IDs
  const accountList = await api.query.system.account.entries();

  const balances = [];

  for (const [key, value] of accountList) {
    const address = key.args[0].toHuman();
    const { data: { miscFrozen } } = value;
    const bonded = Number(miscFrozen) / 10e17;


    if (miscFrozen != 0) {
      balances.push({
        accountId: address,
        Bonded: bonded,
      });
    }
  }
  return balances;
}

function getBondedValue(bondedData, accountId) {
  const entry = bondedData.find(data => data.accountId === accountId);
  return entry ? entry.Bonded : null;
}

async function getIdentities(api, wallets) {
  const identities = {};
  let identityRaw;
  let identity;

  for (const wallet of wallets) {

    let parent = await api.query.identity.superOf(wallet)
    if (parent.isSome) {

      const subIdentityName = parent.toHuman()[1].Raw;
      const subIdentityWallet = parent.toHuman()[0];

      identityRaw = await api.query.identity.identityOf(subIdentityWallet)
      identity = identityRaw.isSome
        ? hexToString(identityRaw.unwrap().info.display.toString())
            .replace(/\n/g, '')
            .replace(/\x00/g, '')
            + "/" + subIdentityName
        : false

    } else {
      identityRaw = await api.query.identity.identityOf(wallet)
      identity = identityRaw.isSome
        ? hexToString(identityRaw.unwrap().info.display.toString())
            .replace(/\n/g, '')
            .replace(/\x00/g, '')
        : false
    }

    validatorID = identityRaw.isSome ? identity : wallet;
    identities[wallet] = validatorID;
  }

  return identities;
}

async function main() {
  const provider = new WsProvider('wss://mainnet.ternoa.network');
  const api = await ApiPromise.create({ provider });

  const nominators = await api.query.staking.nominators.entries();

  const mergedNominators = nominators.map(([nominatorId, nominatorData]) => {
    return {
      nominator: nominatorId.toHuman(),
      targets: nominatorData.toHuman().targets,
    };
  });

  const validators = await api.query.staking.validators.entries().then(r => r.map(v => v[0].toHuman()[0]));
  const validatorsID = await getIdentities(api, validators);
  console.log(validatorsID);

  const activeValidators = (await api.query.session.validators()).toHuman();

  const validatorInfo = {
    active: {},
    waiting: {},
  };

  const bonded = await getAllBalances(api);

  for (const nominator of mergedNominators) {
          for (const target of nominator.targets) {
            if (validators.includes(target)) {
        
              if (activeValidators.includes(target)) {
                if (!validatorInfo["active"][target]) {
                  validatorInfo["active"][target] = { name: validatorsID[target] , nominators: 0, totalBondedBalance: 0 };
                }
                validatorInfo["active"][target].nominators++;
                let bondedBalance = Math.round(getBondedValue(bonded, nominator.nominator[0]));
                validatorInfo["active"][target].totalBondedBalance += bondedBalance;
              } else {
                if (!validatorInfo["waiting"][target]) {
                  validatorInfo["waiting"][target] = { name: validatorsID[target], nominators: 0, totalBondedBalance: 0 };
                }
                validatorInfo["waiting"][target].nominators++;
                let bondedBalance = Math.round(getBondedValue(bonded, nominator.nominator[0]));
                validatorInfo["waiting"][target].totalBondedBalance += bondedBalance;
              }
            }
          }
          
  }
    
      // Sort validatorInfo.active by totalBondedBalance
      const sortedActiveValidators = Object.keys(validatorInfo.active).sort(
        (a, b) => validatorInfo.active[b].totalBondedBalance - validatorInfo.active[a].totalBondedBalance
      );
      const sortedWaitingValidators = Object.keys(validatorInfo.waiting).sort(
        (a, b) => validatorInfo.waiting[b].totalBondedBalance - validatorInfo.waiting[a].totalBondedBalance
      );

      const sortedValidatorInfo = {
        active: {},
        waiting: {},
      };
    
      for (const validator of sortedActiveValidators) {
        sortedValidatorInfo.active[validator] = validatorInfo.active[validator];
      }
      for (const validator of sortedWaitingValidators) {
        sortedValidatorInfo.waiting[validator] = validatorInfo.waiting[validator];
      }
    
      console.log(sortedValidatorInfo);
  
  // Disconnect from the API when you're done
  await api.disconnect();
}

main().catch(console.error);
