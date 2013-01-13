package controllers

import play.api.Routes
import play.api.mvc._
import play.api.Play.current
import play.modules.reactivemongo._
import customcommands._
import reactivemongo.bson._
import reactivemongo.bson.handlers.DefaultBSONHandlers._
import play.api.libs.json._
import play.api.libs.functional.syntax._
import reactivemongo.api.gridfs._
import reactivemongo.core.commands.{Update, FindAndModify}
import reactivemongo.api.QueryOpts
import reactivemongo.core.commands.Count

object Application extends Controller with MongoController {

  def index = Action { Ok(views.html.index("")) }

  def database(name: String) = Action {
    Async {
      listStores(name).map { stores =>
        Ok(Json.toJson(stores))
      }
    }
  }

  def databases = Action {
    implicit val jsondb = Json.writes[Database]
    Async {
      ReactiveMongoPlugin.db.command(ListDatabases).map(list => Ok(Json.toJson(list)))
    }
  }

  def listFiles(dbName: String, store: String, offset: Int = 0, max: Int = 3) = Action {
    import play.modules.reactivemongo.PlayBsonImplicits._
    val db = ReactiveMongoPlugin.connection.apply(dbName)
    val gfs = GridFS(db, store)
    Async {
      gfs.files.find[BSONDocument, JsValue](BSONDocument(), QueryOpts().skip(offset).batchSize(max)).toList(max).map { files =>
        Ok(Json.toJson(files))
      }
    }
  }

  def add(db: String, store: String) = Action(gridFSBodyParser(GridFS(ReactiveMongoPlugin.connection.apply(db), store))) { request =>
    val gfs = GridFS(ReactiveMongoPlugin.connection.apply(db), store)
    request.body.files.headOption.map { file =>
      Async {
        file.ref.flatMap { file =>
          gfs.files.find(BSONDocument("_id" -> file.id)).headOption().map { file =>
            import play.modules.reactivemongo.PlayBsonImplicits
            Ok(Json.toJson(PlayBsonImplicits.JsValueReader.fromBSON(file.get)))
          }
        }
      }
    }.getOrElse(BadRequest)
  }

  def update(db: String, store: String, id: String) = Action { request =>
    def filter(name: String) = {
      !name.startsWith("$") && name != "_id" && name != "chunkSize" &&
        name != "length" && name != "md5" && name != "uploadDate"
    }
    request.body.asFormUrlEncoded.map { m => println(Json.toJson(m))}
    println(s"update $id on $db.$store with ${request.body.asJson} ${request.body.asFormUrlEncoded}")
    val obj = request.body.asJson.flatMap(_.asOpt[JsObject])
    obj.map { obj =>
      println(obj)
      val json = obj.\("$set").asOpt[JsObject].map { set =>
        val fields = set.fieldSet.filter { tuple =>
          filter(tuple._1)
        }.toSeq
        JsObject(fields)
      }.getOrElse(Json.obj())
      println(s"set=$json")
      val unset = obj.\("$unset").asOpt[JsArray].map { set =>
        JsObject(set.value.filter {
          case s: JsString => filter(s.value)
        }.map(_.as[JsString].value -> JsNumber(1)).toSeq)
      }.getOrElse(Json.obj())
      val gfs = GridFS(ReactiveMongoPlugin.connection.apply(db), store)
      val modifier = Json.obj(
        "$set" -> json,
        "$unset" -> unset
      )
      println(s"modifier=$modifier")

      import play.modules.reactivemongo.PlayBsonImplicits._

      Async {
        ReactiveMongoPlugin.connection.apply(db).command(FindAndModify(
          gfs.files.name,
          BSONDocument("_id" -> BSONObjectID(id)),
          Update(PlayBsonImplicits.write2BSON(modifier, BSONDocument()), true)
        )).filter(_.isDefined).map { updated =>
          Ok(PlayBsonImplicits.JsValueReader.fromBSON(updated.get))
        }.recover {
          case e: Throwable =>
            e.printStackTrace()
            BadRequest
        }
      }
    }.getOrElse(BadRequest)
  }

  def listCollections(dbName: String) = {
    ReactiveMongoPlugin.connection.db(dbName).collection("system.namespaces").find(BSONDocument()).toList().map { list =>
      list.map { doc =>
        doc.getAs[BSONString]("name").get.value.substring(dbName.length + 1)
      } filter { name =>
        !name.contains("$")
      }
    }
  }

  def listStores(dbName: String) = {
    val db = ReactiveMongoPlugin.connection.db(dbName)

    for {
      collections <- listCollections(dbName)
      stores <- scala.concurrent.Future.sequence(
        collections filter(_.endsWith(".files")) map (_.dropRight(".files".length)) map { store =>
          val gfs = GridFS(ReactiveMongoPlugin.connection.apply(dbName), store)
          db.command(Count(gfs.files.name, Some(BSONDocument().toTraversable))).map { i =>
            Json.obj(
              "store" -> store,
              "size" -> i)
          }
        }
      )
    } yield stores
  }

  def getFile(dbName: String, store: String, id: String) = Action {
    val gfs = GridFS(ReactiveMongoPlugin.connection.apply(dbName), store)
    import reactivemongo.api.gridfs.Implicits._
    val file = gfs.find(BSONDocument("_id" -> BSONObjectID(id)))
    Async {
      serve(gfs, file)
    }
  }

  def jsRouter = Action { implicit request =>
    Ok(Routes.javascriptRouter("PlayRouter")(
      controllers.routes.javascript.Application.listFiles,
      controllers.routes.javascript.Application.database,
      controllers.routes.javascript.Application.update,
      controllers.routes.javascript.Application.getFile,
      controllers.routes.javascript.Application.add
    ))
  }
}