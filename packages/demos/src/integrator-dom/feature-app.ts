import {FeatureAppDefinition} from '@feature-hub/core';
import {DomFeatureApp} from '@feature-hub/dom';
import {DetachFunction} from '@feature-hub/dom';

const featureAppDefinition: FeatureAppDefinition<DomFeatureApp> = {
  create: () => ({
    attachTo(element: HTMLElement): void | DetachFunction{
      element.replaceWith('Hello, World!');

      return () => {
        console.log('You can do a cleanup when element is detached');
      };
    },
  }),
};

export default featureAppDefinition;
