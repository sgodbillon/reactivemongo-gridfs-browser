package controllers

import play.api.mvc._
import play.api.Play.current
import play.modules.reactivemongo._
import customcommands._
import reactivemongo.bson._
import reactivemongo.bson.handlers.DefaultBSONHandlers._

import play.api.libs.json._
import play.api.libs.functional.syntax._

import reactivemongo.api.gridfs._

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

  def listFiles(dbName: String, store: String) = Action {
    import reactivemongo.api.gridfs.Implicits.defaultReadFileReader
    import play.modules.reactivemongo.PlayBsonImplicits

    implicit object BSONValueWriter extends Writes[BSONValue] {
      def writes(value: BSONValue) = PlayBsonImplicits.toTuple(new DefaultBSONElement("", value))._2
    }

    implicit val json = Json.writes[reactivemongo.api.gridfs.DefaultReadFile]
    val db = ReactiveMongoPlugin.connection.apply(dbName)
    val gfs = GridFS(db, store)
    Async {
      gfs.find(BSONDocument()).toList().map { files =>
        Ok(Json.toJson(files))
      }
    }
  }

  def add(db: String, store: String) = Action { Ok }

  def update(db: String, store: String, id: String) = Action { Ok }

  def listCollections(dbName: String) = ReactiveMongoPlugin.connection.apply(dbName).collection("system.namespaces").find(BSONDocument()).toList().map { list =>
    list.map { doc =>
      doc.getAs[BSONString]("name").get.value.substring(ReactiveMongoPlugin.db.name.length + 1)
    } filter { name =>
      !name.contains("$")
    }
  }

  def listStores(dbName: String) = listCollections(dbName).map(_ filter(_.endsWith(".files")) map (_.dropRight(".files".length)))
}