import express, { Express } from 'express';
import passport from 'passport';
import boom from '@hapi/boom';
import jwt from 'jsonwebtoken';
import { config } from 'config';
import ApiKeysService from 'services/apiKeysService';
import basicStrategy from 'utils/auth/strategies/basic';
import GoogleStrategy from 'utils/auth/strategies/oauth';
import validationHandler from 'utils/middlewares/validationHandler';
import { createUserSchema } from 'utils/schemas/userSchema';
import UsersService from 'services/users';
import { User } from 'models/user';
import {
  THIRTY_DAYS_IN_MILLISECONDS,
  TWO_HOURS_IN_MILLISECONDS,
} from 'utils/common/time';

function authRoute(app: Express) {
  const router = express.Router();
  const apiKeysService = new ApiKeysService();
  const usersService = new UsersService();
  app.use('/api/auth', router);

  router.post(
    '/register',
    validationHandler(createUserSchema),
    async function (req, res, next) {
      const body: User = req.body;

      try {
        // Verify if the user already exists
        const user = await usersService.getUser(body.email);
        if (user) {
          res.status(400).json({
            message: 'user already exists',
          });
          return;
        }

        // Create the user and return the response
        const createdUserId = await usersService.createUser(body);
        res.status(201).json({
          data: { id: createdUserId },
          message: 'user created',
        });
      } catch (error) {
        next(error);
      }
    }
  );

  router.post(
    '/login',
    passport.authenticate(basicStrategy, { session: false }),
    async function (req, res, next) {
      const { rememberMe } = req.body;
      const { API_KEY_TOKEN } = req.query;

      //Verify if the API_KEY_TOKEN is present
      if (!API_KEY_TOKEN) {
        next(
          boom.unauthorized(
            '[API_KEY_TOKEN] property is required in request body.'
          )
        );
        return;
      }

      const apiKey = await apiKeysService.getApiKey(API_KEY_TOKEN as string);

      if (!apiKey) {
        next(boom.unauthorized());
        return;
      }

      // Generate a JWT with the user data and access scopes (Note that the req.user is provided by the passsport.authenticate() middleware)
      const { _id: id, name, email } = req.user as any;
      const payload = {
        sub: id,
        name,
        email,
        scopes: apiKey.scopes,
      };
      const token = jwt.sign(payload, config.AUTH_JWT_SECRET, {
        expiresIn: '15m',
      });

      //Return the JWT and set the cookie
      res.cookie('token', token, {
        httpOnly: !config.dev,
        secure: !config.dev,
        sameSite: 'none',
        maxAge: rememberMe
          ? THIRTY_DAYS_IN_MILLISECONDS
          : TWO_HOURS_IN_MILLISECONDS,
      });
      return res.status(200).json({ token });
    }
  );

  router.get(
    '/google',
    passport.authenticate(GoogleStrategy, {
      scope: ['openid', 'profile', 'email'],
    })
  );

  router.get(
    '/google/callback',
    passport.authenticate(GoogleStrategy, {
      session: false,
    }),
    async function (req, res, _next) {
      console.log(req.user);
      res.status(201).json({
        data: { user: req.user },
        message: 'login success with google',
      });
    }
  );
}

export default authRoute;
